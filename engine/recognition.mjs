import path from 'node:path';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { extract } from './media.mjs';
import { root, binary, run, hashFile, emit } from './process.mjs';
import { generatedCues } from './quality.mjs';
import { visibleText } from './subtitles.mjs';
import { createHash } from 'node:crypto';
import { recognitionConfidenceTier } from '../shared/dust-wave-platform/packages/timed-text/src/confidence.js';

export const languages = JSON.parse(await readFile(path.join(root,'resources/parakeet-capabilities.json'),'utf8')).languages;
export async function identify(text, directory, name='language') {
  // Sample across long media instead of using only the beginning of the transcript.
  const sampled=text.length<=32000?text:Array.from({length:8},(_,i)=>text.slice(Math.floor(i*(text.length-4000)/7),Math.floor(i*(text.length-4000)/7)+4000)).join(' ');
  const file=path.join(directory,name+'.txt');await writeFile(file,sampled,{mode:0o600});
  const scores=JSON.parse((await run(binary('auto-subtitle-speech'),['language',file])).trim());
  const best=Object.entries(scores).sort((a,b)=>b[1]-a[1])[0];
  return best && best[1]>=.8 ? best[0] : 'und';
}
function validResult(result, lengthMs) {
  if (!Array.isArray(result.words) || !Array.isArray(result.tokens)) return false;
  return result.words.every(w=>typeof w.text==='string'&&w.text.length<2000&&Number.isFinite(w.startsAtSeconds)&&Number.isFinite(w.endsAtSeconds)&&w.startsAtSeconds>=0&&w.endsAtSeconds>w.startsAtSeconds&&w.endsAtSeconds*1000<=lengthMs+500);
}
export async function recognize({video,stream,durationMs,model,directory}) {
  const chunkDir=path.join(directory,'recognition-v1');await mkdir(chunkDir,{recursive:true,mode:0o700});
  const chunks=[],pending=[];
  for(let core=0;core<durationMs;core+=60000) {
    const start=Math.max(0,core-2000),end=Math.min(durationMs,core+62000);
    const chunk={core,start,end,audio:path.join(chunkDir,`${core}.wav`),output:path.join(chunkDir,`${core}.json`)};
    chunks.push(chunk);
    try {
      const receipt=JSON.parse(await readFile(chunk.output+'.receipt','utf8'));
      const result=JSON.parse(await readFile(chunk.output,'utf8'));
      if(receipt.sha256!==await hashFile(chunk.output)||!validResult(result,end-start))throw new Error();
      continue;
    }catch{}
    await rm(chunk.audio,{force:true});
    emit({type:'progress',stage:'Preparing speech',fraction:core/durationMs});
    await extract(video,stream,start,end-start,chunk.audio);
    pending.push(chunk);
  }
  if(pending.length) {
    const request=path.join(chunkDir,'request.json');await writeFile(request,JSON.stringify(pending.map(({audio,output})=>({audio,output}))),{mode:0o600});
    emit({type:'progress',stage:'Recognizing speech',fraction:0});
    const receipts=[];
    try {
      await run(binary('auto-subtitle-speech'),['transcribe',model,request],{onEvent:event=>{
        if(event.type==='chunk') {
          emit({type:'progress',stage:'Recognizing speech',fraction:event.completed/event.total});
          const c=pending[event.completed-1];
          if(c) receipts.push((async()=>{
            const result=JSON.parse(await readFile(c.output,'utf8'));
            if(!validResult(result,c.end-c.start))throw new Error('Speech recognition returned invalid timing.');
            await writeFile(c.output+'.receipt',JSON.stringify({sha256:await hashFile(c.output)}),{mode:0o600});
            await rm(c.audio,{force:true});
          })());
        }
      }});
    } finally {await Promise.all(receipts);}
    for(const c of pending) {
      const result=JSON.parse(await readFile(c.output,'utf8'));
      if(!validResult(result,c.end-c.start))throw new Error('Speech recognition returned invalid timing. Retry this file.');
      await writeFile(c.output+'.receipt',JSON.stringify({sha256:await hashFile(c.output)}),{mode:0o600});
      await rm(c.audio,{force:true});
    }
  }
  const words=[],tokens=[];
  for(const c of chunks) {
    const result=JSON.parse(await readFile(c.output,'utf8'));
    for(const w of result.words) {
      const start=Math.round(w.startsAtSeconds*1000)+c.start,end=Math.min(durationMs,Math.round(w.endsAtSeconds*1000)+c.start);
      const middle=(start+end)/2;
      if(middle<c.core||middle>=Math.min(durationMs,c.core+60000)||end<=start)continue;
      if(words.at(-1)?.startsAtMs>start)continue;
      words.push({text:w.text,startsAtMs:start,endsAtMs:end});
    }
    for(const t of result.tokens) {
      const start=Math.round(t.startsAtSeconds*1000)+c.start,end=Math.min(durationMs,Math.round(t.endsAtSeconds*1000)+c.start);
      if((start+end)/2<c.core||(start+end)/2>=Math.min(durationMs,c.core+60000)||end<=start)continue;
      tokens.push({text:t.text,startsAtMs:start,endsAtMs:end,confidence:t.confidence});
    }
  }
  return {words,tokens};
}
const normalized=text=>text.toLocaleLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu,'').replace(/\s+/g,' ').trim();
export function similarity(a,b) {
  const x=normalized(a).split(' '),y=normalized(b).split(' '),row=new Array(y.length+1).fill(0);
  for(const word of x){let old=0;for(let j=1;j<=y.length;j++){const previous=row[j];row[j]=word===y[j-1]?old+1:Math.max(row[j],row[j-1]);old=previous;}}
  return 2*row[y.length]/(x.length+y.length);
}
export function safeWordingCandidate(source,candidate,tokens) {
  const sourceWords=normalized(source).split(' '),candidateWords=normalized(candidate).split(' ');
  if(sourceWords.length!==candidateWords.length||sourceWords.length<4)return false;
  if(sourceWords.filter((w,i)=>w!==candidateWords[i]).length!==1)return false;
  const changed=sourceWords.findIndex((w,i)=>w!==candidateWords[i]);
  const old=sourceWords[changed],replacement=candidateWords[changed];
  const unaccented=t=>t.normalize('NFD').replace(/\p{M}/gu,'');
  if(unaccented(old)===unaccented(replacement))return false;
  let row=Array.from({length:replacement.length+1},(_,i)=>i);
  for(let i=1;i<=old.length;i++) {const next=[i];for(let j=1;j<=replacement.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(old[i-1]===replacement[j-1]?0:1));row=next;}
  if(row.at(-1)>Math.max(2,Math.floor(Math.max(old.length,replacement.length)*.35)))return false;
  if(Math.min(old.length,replacement.length)/Math.max(old.length,replacement.length)<.6)return false;
  const score=similarity(source,candidate);
  if(score<.7||score>=1||!tokens.length||Math.min(...tokens.map(t=>t.confidence))<.9)return false;
  // Names and polarity are costly errors. Keep them even when repeated ASR agrees.
  const protectedWords=text=>normalized(text).split(' ').filter(w=>/^(no|not|never|neither|nor|nunca|jamás|ni|sin|non|pas|nicht|kein|нет|не)$/u.test(w)).sort().join(' ');
  if(protectedWords(source)!==protectedWords(candidate))return false;
  const names=source.split(/\s+/).filter(w=>/^\p{Lu}\p{Ll}/u.test(w));
  if(names.some(name=>!normalized(candidate).split(' ').includes(normalized(name))))return false;
  return recognitionConfidenceTier(Math.min(...tokens.map(t=>t.confidence)))!=='low';
}
export function preserveWordingSurface(source,candidate) {
  const expression=/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’]*/gu;
  const words=candidate.match(expression)??[];
  if((source.match(expression)??[]).length!==words.length)return source;
  let i=0;
  return source.replace(expression,word=>{
    const replacement=words[i++];
    if(word.toLocaleLowerCase()===replacement.toLocaleLowerCase())return word;
    return /^\p{Lu}/u.test(word)?replacement[0].toLocaleUpperCase()+replacement.slice(1):replacement;
  });
}
export function phraseWords(cue,allWords) {
  const pool=allWords.filter(w=>w.endsAtMs>=cue.start-1500&&w.startsAtMs<=cue.end+1500);
  const count=normalized(cue.text).split(' ').length;
  let best=[],score=-Infinity;
  for(let i=0;i+count<=pool.length;i++) {
    const words=pool.slice(i,i+count),text=words.map(w=>w.text).join(' ');
    const overlap=Math.min(cue.end,words.at(-1).endsAtMs)-Math.max(cue.start,words[0].startsAtMs);
    if(overlap<=0)continue;
    const candidateScore=similarity(cue.text,text)-Math.abs(words[0].startsAtMs-cue.start)/30000-Math.abs(words.at(-1).endsAtMs-cue.end)/30000;
    if(candidateScore>score){best=words;score=candidateScore;}
  }
  return best;
}
export function dictionaryAllowsCorrection(source,candidate,dictionary) {
  if(dictionary.available!==true||!Array.isArray(dictionary.misspelled))return false;
  const old=normalized(source).split(' '),next=normalized(candidate).split(' ');
  const index=old.findIndex((w,i)=>w!==next[i]);
  return index>=0&&dictionary.misspelled.includes(old[index])&&!dictionary.misspelled.includes(next[index]);
}
export async function improve(cues,recognition,context) {
  const changes=[],result=cues.map(c=>({...c})),candidates=[];
  for(const c of result) {
    if(context.skipRanges?.some(r=>r.end>c.start&&r.start<c.end))continue;
    if (/[<{]|^\s*[-–—♪♫\[]/mu.test(c.text))continue;
    const words=phraseWords(c,recognition.words);
    if(words.length<3)continue;
    const text=words.map(w=>w.text).join(' '),score=similarity(visibleText(c.text,context.format),text);
    const tokens=recognition.tokens.filter(t=>t.startsAtMs>=words[0].startsAtMs&&t.endsAtMs<=words.at(-1).endsAtMs&&/\p{L}/u.test(t.text));
    if(safeWordingCandidate(visibleText(c.text,context.format),text,tokens))candidates.push({cue:c,text,words});
  }
  if(candidates.length) {
    const words=[...new Set(candidates.flatMap(c=>[...normalized(c.cue.text).split(' '),...normalized(c.text).split(' ')]))];
    const file=path.join(context.directory,'spelling-input.json');await writeFile(file,JSON.stringify(words),{mode:0o600});
    const dictionary=JSON.parse(await run(binary('auto-subtitle-speech'),['spelling',context.language,file]));
    for(let i=candidates.length-1;i>=0;i--)if(!dictionaryAllowsCorrection(candidates[i].cue.text,candidates[i].text,dictionary))candidates.splice(i,1);
  }
  // Recover only isolated speech intervals with ample space on both sides.
  for(const generated of generatedCues(recognition.words,context.durationMs)) {
    if(context.skipRanges?.some(r=>r.end>generated.start&&r.start<generated.end))continue;
    const words=recognition.words.filter(w=>w.startsAtMs>=generated.start&&w.endsAtMs<=generated.end);
    if(words.length<3||cues.some(c=>c.end>generated.start-250&&c.start<generated.end+250))continue;
    const tokens=recognition.tokens.filter(t=>t.startsAtMs>=generated.start&&t.endsAtMs<=generated.end&&/\p{L}/u.test(t.text));
    if(!tokens.length||Math.min(...tokens.map(t=>t.confidence))<.95)continue;
    const nearest=cues.reduce((a,b)=>Math.abs(a.start-generated.start)<Math.abs(b.start-generated.start)?a:b);
    const cue={...nearest,...generated,id:`recovered-${generated.start}`,lineage:[`audio-${generated.start}-${generated.end}`]};
    candidates.push({cue,text:generated.text,words,insert:true});
  }
  const pending=[];
  for(let i=0;i<candidates.length;i++) {
    const c=candidates[i],start=Math.max(0,c.cue.start-12000),end=Math.min(context.durationMs,c.cue.end+12000);
    emit({type:'progress',stage:'Checking wording with additional context',fraction:i/candidates.length});
    const key=createHash('sha256').update(JSON.stringify({start,end,text:c.text,policy:3})).digest('hex');
    const directory=path.join(context.directory,'wording-v2',key);await mkdir(directory,{recursive:true});
    const audio=path.join(directory,'audio.wav'),output=path.join(directory,'result.json'),request=path.join(directory,'request.json');
    Object.assign(c,{start,end,audio,output});
    try {
      const receipt=JSON.parse(await readFile(output+'.receipt','utf8'));
      if(receipt.sha256===await hashFile(output)&&validResult(JSON.parse(await readFile(output,'utf8')),end-start))continue;
    }catch{}
    await rm(audio,{force:true});await extract(context.video,context.stream,start,end-start,audio);pending.push(c);
  }
  if(pending.length) {
    const request=path.join(context.directory,'wording-request.json');await writeFile(request,JSON.stringify(pending.map(({audio,output})=>({audio,output}))));
    const receipts=[];
    try {await run(binary('auto-subtitle-speech'),['transcribe',context.model,request],{onEvent:event=>{
      if(event.type!=='chunk')return;
      emit({type:'progress',stage:'Verifying wording with additional context',fraction:event.completed/event.total});
      const c=pending[event.completed-1];if(c)receipts.push((async()=>{await writeFile(c.output+'.receipt',JSON.stringify({sha256:await hashFile(c.output)}));await rm(c.audio,{force:true});})());
    }});}finally{await Promise.all(receipts);}
  }
  for(const c of candidates) {
    const {start,end}=c;
    const check=JSON.parse(await readFile(c.output,'utf8'));
    if(!validResult(check,end-start))continue;
    const words=check.words.filter(w=>w.startsAtSeconds*1000+start>=c.words[0].startsAtMs-300&&w.endsAtSeconds*1000+start<=c.words.at(-1).endsAtMs+300);
    const text=words.map(w=>w.text).join(' ');
    if(normalized(text)===normalized(c.text)) {
      const corrected=c.insert?c.text:preserveWordingSurface(c.cue.text,c.text);
      if(!c.insert&&corrected===c.cue.text)continue;
      changes.push({type:c.insert?'recover-speech':'wording',id:c.cue.id,before:c.insert?null:c.cue.text,after:corrected,reason:'Matching recognition with additional context and strong token evidence; complete phrase retained'});
      c.cue.text=corrected;
      if(c.insert)result.push(c.cue);
    }
  }
  return {cues:result.sort((a,b)=>a.start-b.start),changes,checked:candidates.length};
}
