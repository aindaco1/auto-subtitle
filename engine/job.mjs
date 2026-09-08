import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, lstat, rm, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { root, runtime, binary, run, hashFile, emit, processingSignal } from './process.mjs';
import { probe } from './media.mjs';
import { readSubtitle, renderSubtitle, visibleText } from './subtitles.mjs';
import { cleanCues, generatedCues } from './quality.mjs';
import { store, discoverModel, verifyModel, manifest } from './models.mjs';
import { recognize, identify, improve, languages } from './recognition.mjs';
import { auditLanguages, guardGeneratedLanguage } from './language-guard.mjs';

export async function validateRequest(request) {
  if(request.schema!==1 || !['align','generate'].includes(request.mode))throw new Error('Unsupported job request.');
  const allowed=new Set(['schema','mode','video','subtitle','format','cleanup','improve','language','stream','model','output','translated','repairLanguage']);
  if(Object.keys(request).some(k=>!allowed.has(k)))throw new Error('The job request contains an unknown option.');
  for(const key of ['video',...(request.mode==='align'?['subtitle']:[])]) {
    if(typeof request[key]!=='string'||!path.isAbsolute(request[key]))throw new Error(`Choose a local ${key} file.`);
    const stat=await lstat(request[key]);if(!stat.isFile())throw new Error(`Choose a regular ${key} file.`);
  }
  if(!['srt','ass'].includes(request.format))throw new Error('Choose SRT or ASS output.');
  for(const key of ['cleanup','improve','translated','repairLanguage'])if(request[key]!==undefined&&typeof request[key]!=='boolean')throw new Error(`Invalid ${key} option.`);
  if((request.mode==='generate'||request.improve)&&request.language && request.language!=='auto'&&!languages.includes(request.language))throw new Error('This audio language is not supported by Parakeet. Timing-only alignment supports all subtitle languages.');
  if(request.output&&(!path.isAbsolute(request.output)||[request.video,request.subtitle].includes(request.output)))throw new Error('Choose a new output path. Original files cannot be overwritten.');
  if(request.translated&&request.improve)throw new Error('Translated subtitles support timing and formatting. Turn off Improve accuracy to preserve the translation.');
}

export function applyTiming(cues,evidence,durationMs) {
  const changes=[],unresolved=[];
  const transformed=cues.map(c=>{
    let scale=1,offset=0;
    if(evidence.accepted) {scale=evidence.transform.scale;offset=evidence.transform.offset*1000;}
    else {
      const t=evidence.transform;
      const start=c.start/1000*t.scale+t.offset,end=c.end/1000*t.scale+t.offset;
      const piece=evidence.pieces?.find(p=>start>=p.start&&end<=p.end);
      if(piece){scale=t.scale;offset=(t.offset+piece.offset)*1000;}
      else {unresolved.push(c.id);return {...c};}
    }
    const start=c.start*scale+offset,end=c.end*scale+offset;
    if(start<0||end>durationMs||end<=start){unresolved.push(c.id);return {...c};}
    if(Math.abs(start-c.start)>.5||Math.abs(end-c.end)>.5)changes.push({type:'timing',id:c.id,before:[c.start,c.end],after:[start,end]});
    return {...c,start,end};
  });
  if(!evidence.accepted) {
    for(let i=1;i<transformed.length;i++)if(cues[i-1].end<=cues[i].start&&transformed[i-1].end>transformed[i].start) {
      for(const index of [i-1,i]){transformed[index]={...cues[index]};if(!unresolved.includes(cues[index].id))unresolved.push(cues[index].id);}
    }
  }
  return {cues:transformed,changes:changes.filter(c=>!unresolved.includes(c.id)),unresolved};
}

export async function runJob(request) {
  await validateRequest(request);
  const media=await probe(request.video),stream=request.stream??media.audio[0].index;
  if(!media.audio.some(t=>t.index===stream))throw new Error('The selected audio track no longer exists.');
  emit({type:'progress',stage:'Checking source files',fraction:null});
  const videoHash=await hashFile(request.video),subtitleHash=request.subtitle?await hashFile(request.subtitle):null;
  const key=createHash('sha256').update(JSON.stringify({schema:1,videoHash,stream,model:manifest.revision,engine:'0.3.0'})).digest('hex');
  const directory=path.join(store,'Jobs',key);await mkdir(directory,{recursive:true,mode:0o700});
  const lock=path.join(directory,'running.lock');
  try{await writeFile(lock,String(process.pid),{flag:'wx',mode:0o600});}catch{
    const previous=Number(await readFile(lock,'utf8'));
    let stale=false;
    if(Number.isSafeInteger(previous)&&previous>0) {try{process.kill(previous,0);}catch(error){stale=error.code==='ESRCH';}}
    if(!stale)throw new Error('This video is already processing. Wait for that job or cancel it before retrying.');
    await rm(lock);await writeFile(lock,String(process.pid),{flag:'wx',mode:0o600});
  }
  try {
    let doc,cues,evidence,timing={changes:[],unresolved:[]},recognition,language=request.language??'auto',wording={changes:[]};
    const notices=[];
    let languageAudit,languageRepair={changes:[],checks:[],unresolved:[]};
    await writeFile(path.join(directory,'source.json'),JSON.stringify({schema:1,videoHash,subtitleHash,stream,modelRevision:manifest.revision,request}),{mode:0o600});
    if(request.mode==='align') {
      doc=await readSubtitle(request.subtitle);cues=doc.cues;
      const syncRequest=path.join(directory,'sync-request.json');
      await writeFile(syncRequest,JSON.stringify({ffmpeg:binary('ffmpeg'),video:request.video,stream,durationMs:media.durationMs,cues:cues.map(({start,end})=>({start,end})),cache:path.join(directory,'activity.npy')}),{mode:0o600});
      await run(path.join(runtime,'python/bin/python3.11'),[path.join(root,'engine/sync.py'),syncRequest],{onEvent:event=>{if(event.type==='result')evidence=event;else emit(event);}});
      if(!evidence)throw new Error('Timing analysis returned no result.');
      timing=applyTiming(cues,evidence,media.durationMs);cues=timing.cues;
      if(!evidence.accepted)notices.push(`${timing.unresolved.length} cues have uncertain timing and were retained. Check playback before using this result.`);
    }
    if(request.mode==='generate'||request.improve) {
      emit({type:'progress',stage:'Finding the local speech model',fraction:null});
      const model=request.model?await verifyModel(request.model):await discoverModel({progress:fraction=>emit({type:'progress',stage:'Importing verified speech model',fraction})});
      if(!model)throw Object.assign(new Error('Set up the Parakeet speech model, then retry. Timing-only alignment does not need it.'),{code:'MODEL_MISSING'});
      recognition=await recognize({video:request.video,stream,durationMs:media.durationMs,model,directory});
      const recognizedLanguage=await identify(recognition.words.map(w=>w.text).join(' '),directory,'recognized-language');
      if(language==='auto')language=recognizedLanguage;
      if(language!=='und'&&!languages.includes(language))throw new Error('The recognized language is outside Parakeet’s supported languages.');
      if(request.mode==='generate') {
        if(language!==recognizedLanguage&&recognizedLanguage!=='und')notices.push(`The transcript is mainly ${recognizedLanguage}; checking suspicious passages against the selected ${language} language.`);
        doc={format:request.format,newline:'\n',cues:[]};
        // Establish timing once using the primary recognition. A wording retry cannot move it.
        cues=cleanCues(generatedCues(recognition.words,media.durationMs),{language,cleanup:request.cleanup!==false,generated:true,durationMs:media.durationMs,fps:media.fps}).cues;
        languageAudit=await auditLanguages(cues,language,directory);
        languageRepair=await guardGeneratedLanguage(cues,languageAudit,{video:request.video,stream,durationMs:media.durationMs,directory,repair:request.repairLanguage!==false});
        cues=languageRepair.cues;notices.push(...languageRepair.notices);
        // A generated ASS document uses the SRT-to-ASS adapter and default style.
        doc.format='srt';
      } else {
        languageAudit=await auditLanguages(generatedCues(recognition.words,media.durationMs),language,directory);
        languageRepair.unresolved=languageAudit.flags;
        const subtitleLanguage=await identify(doc.cues.map(c=>visibleText(c.text,doc.format)).join(' '),directory,'subtitle-language');
        if(subtitleLanguage==='und'||recognizedLanguage==='und'||subtitleLanguage!==recognizedLanguage||language!==recognizedLanguage)notices.push('Wording was preserved: the subtitle and recognized audio languages do not confidently match. Timing alignment remains available for translations.');
        else if(timing.unresolved.length)notices.push('Wording was preserved because the timing is uncertain.');
        else {wording=await improve(cues,recognition,{video:request.video,stream,durationMs:media.durationMs,model,directory,format:doc.format,language,skipRanges:languageAudit.flags});cues=wording.cues;notices.push(`Wording check: ${wording.changes.length} conservative corrections. Original and changed text are recorded in the local report.`);}
      }
      if(language==='und')notices.push('The spoken language could not be established. Check playback; automatic language repair was skipped.');
      if(languageRepair.unresolved.length) {
        const stamp=ms=>`${Math.floor(ms/3600000).toString().padStart(2,'0')}:${Math.floor(ms/60000)%60<10?'0':''}${Math.floor(ms/60000)%60}:${Math.floor(ms/1000)%60<10?'0':''}${Math.floor(ms/1000)%60}`;
        notices.push(`${languageRepair.unresolved.length} captions need a language review, starting at ${languageRepair.unresolved.slice(0,3).map(c=>stamp(c.start)).join(', ')}. Their wording was preserved; see the local report.`);
      }
    }
    emit({type:'progress',stage:'Preparing subtitles',fraction:null});
    const quality=cleanCues(cues,{format:doc.format,language,cleanup:request.cleanup!==false,generated:false,durationMs:media.durationMs,fps:media.fps});
    const text=renderSubtitle(doc,quality.cues,request.format);
    if(doc.format==='ass'&&request.format==='srt')notices.push('SRT cannot carry ASS positioning, animation or styles. Dialogue text and timings were retained.');
    if(doc.format==='ass'&&evidence&&Math.abs(evidence.transform.scale-1)>.0001&&doc.cues.some(c=>/\\(?:k|t|move|fad)/i.test(c.text)))notices.push('ASS relative animation and karaoke tags were preserved. Review their playback after the timing-rate change.');
    const output=path.join(directory,`result-${randomUUID()}.${request.format}`);
    processingSignal.throwIfAborted();
    await writeFile(output,text,{flag:'wx',mode:0o600});
    const report={schema:1,mode:request.mode,output,videoHash,subtitleHash,stream,language,modelRevision:recognition?manifest.revision:null,evidence,changes:[...timing.changes,...wording.changes,...languageRepair.changes,...quality.changes],unresolved:timing.unresolved,languageAudit,languageChecks:languageRepair.checks,languageUnresolved:languageRepair.unresolved,warnings:quality.warnings,notices,cueCount:quality.cues.length,outputHash:await hashFile(output)};
    const reportPath=output+'.report.json';await writeFile(reportPath,JSON.stringify(report,null,2),{mode:0o600});
    if(request.output)await copyFile(output,request.output,constants.COPYFILE_EXCL);
    const summary=request.mode==='generate'?`Created ${quality.cues.length} subtitles.`:evidence.accepted?(Math.abs(evidence.transform.scale-1)>.00005?'Corrected subtitle timing speed.':Math.abs(evidence.transform.offset)>.1?`Shifted subtitles ${Math.abs(evidence.transform.offset).toFixed(2)} seconds ${evidence.transform.offset>0?'later':'earlier'}.`:'Subtitle timing is already consistent.'):'Timing needs a playback check.';
    const result={type:'result',output:request.output??output,report:reportPath,summary,notices,cueCount:quality.cues.length,warningCount:quality.warnings.length,unresolvedCount:timing.unresolved.length,languageReviewCount:languageRepair.unresolved.length};
    emit(result);return result;
  } finally {await rm(lock,{force:true});}
}
