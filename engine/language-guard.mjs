import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { binary, run, emit, processingSignal } from './process.mjs';
import { similarity } from './recognition.mjs';
import { findWhisper, transcribeWhisper, whisperManifest } from './whisper.mjs';

export const languagePolicy=3;
const terms=text=>text.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’]*/gu)??[];
const normalize=text=>terms(text).join(' ').toLocaleLowerCase();
const agreement=text=>normalize(text).normalize('NFD').replace(/\p{M}/gu,'');
export async function languageScores(texts,directory,name='segment-languages') {
  const result=[];
  for(let offset=0;offset<texts.length;offset+=5000) {
    const file=path.join(directory,name+'.json');
    const batch=texts.slice(offset,offset+5000).map(t=>t.slice(0,2000));
    await writeFile(file,JSON.stringify(batch),{mode:0o600});
    const scores=JSON.parse(await run(binary('auto-subtitle-speech'),['languages',file]));
    if(!Array.isArray(scores)||scores.length!==batch.length)throw new Error('Language checking returned an invalid result.');
    result.push(...scores);
  }
  return result;
}
export function auditSamples(cues) {
  const samples=[];
  for(const cue of cues) {
    const words=cue.text.trim().split(/\s+/);
    if(terms(cue.text).length<3)continue;
    samples.push({id:cue.id,text:cue.text});
    if(words.length>5)for(let i=0;i+5<=words.length;i+=2)samples.push({id:cue.id,text:words.slice(i,i+5).join(' ')});
  }
  return samples;
}
export function findLanguageFlags(cues,samples,scores,expected) {
  if(!expected||['und','auto'].includes(expected))return [];
  const flagged=new Map();
  samples.forEach((sample,i)=>{
    const ranked=Object.entries(scores[i]??{}).filter(([,s])=>Number.isFinite(s)).sort((a,b)=>b[1]-a[1]);
    const best=ranked[0];
    if(best&&best[0]!==expected&&best[1]>=.8&&(scores[i][expected]??0)<.2&&terms(sample.text).length>=3) {
      if(!flagged.has(sample.id)||flagged.get(sample.id).score<best[1])flagged.set(sample.id,{language:best[0],score:best[1],reason:'Possible language change; text identification alone does not establish the spoken language'});
    }
  });
  // A narrow Spanish guard supplements mixed-text hypotheses for the observed defect.
  // It marks a candidate only; no word is suppressed or replaced on this evidence.
  if(expected==='es')for(const cue of cues) {
    if(terms(cue.text).length>=4&&/\b(the|you|your|what|where|with|that|this|would|could|should|was|were|because|they)\b/i.test(cue.text)&&!flagged.has(cue.id))flagged.set(cue.id,{language:'en',score:null,reason:'Possible English intrusion in Spanish; requires independent audio verification'});
  }
  return cues.filter(c=>flagged.has(c.id)).map(c=>({id:c.id,start:c.start,end:c.end,...flagged.get(c.id)}));
}
export async function auditLanguages(cues,language,directory) {
  emit({type:'progress',stage:'Checking speech language by passage',fraction:null});
  const samples=auditSamples(cues),scores=await languageScores(samples.map(s=>s.text),directory);
  return {policy:languagePolicy,expectedLanguage:language,flags:findLanguageFlags(cues,samples,scores,language)};
}
export function retryGroups(cues,flags,durationMs) {
  const flagged=new Set(flags.map(f=>f.id)),groups=[];
  for(let i=0;i<cues.length;i++) {
    const cue=cues[i];if(!flagged.has(cue.id))continue;
    const prev=groups.at(-1);
    if(prev&&i===prev.last+1&&cue.end-prev.from<=20000) {prev.ids.push(cue.id);prev.last=i;prev.to=cue.end;}
    else groups.push({ids:[cue.id],first:i,last:i,from:cue.start,to:cue.end});
  }
  return groups.map(g=>({...g,start:Math.max(0,g.from-4000),end:Math.min(durationMs,g.to+4000)}));
}
export function wordsInRange(words,start,end) {return words.filter(w=>(w.startsAtMs+w.endsAtMs)/2>=start&&(w.startsAtMs+w.endsAtMs)/2<end);}
export function allocateWords(words,cues) {
  const groups=cues.map(()=>[]);
  for(const word of words) {
    const point=(word.startsAtMs+word.endsAtMs)/2;
    const distances=cues.map(c=>Math.max(c.start-point,point-c.end,0));
    const nearest=distances.indexOf(Math.min(...distances));
    if(nearest<0||distances[nearest]>500)return null;
    groups[nearest].push(word);
  }
  return groups;
}
export function corroboratingWords(words,automatic,start,end) {
  const target=agreement(automatic.map(w=>w.text).join(' '));
  const pool=wordsInRange(words,Math.max(0,start-1200),end+1200);
  for(let i=0;i<pool.length;i++)for(let n=Math.max(1,automatic.length-2);n<=automatic.length+2&&i+n<=pool.length;n++) {
    const candidate=pool.slice(i,i+n);
    if(agreement(candidate.map(w=>w.text).join(' '))===target)return candidate;
  }
  return wordsInRange(words,start,end);
}
function speechEvidence(words,start,end) {
  const lexical=words.filter(w=>/\p{L}/u.test(w.text));
  if(lexical.length<3||lexical.length>150)return false;
  if(lexical.some(w=>!Number.isFinite(w.confidence)||w.confidence<.1))return false;
  if(lexical.reduce((n,w)=>n+w.confidence,0)/lexical.length<.8)return false;
  // Do not accept a decode covering only one end of the target interval.
  return lexical[0].startsAtMs<=start+1500&&lexical.at(-1).endsAtMs>=end-1800;
}
export function decideLanguageRepair({original,automatic,confirmed,expected,automaticScores,confirmedScores,start,end}) {
  const autoText=automatic.words.map(w=>w.text).join(' '),checkText=confirmed?.words.map(w=>w.text).join(' ')??'';
  if(automatic.words.length&&similarity(original,autoText)>=.85) return {status:'preserved',reason:'Independent recognition corroborates the existing wording; possible intentional language change'};
  if(!confirmed||automatic.language!==expected||confirmed.language!==expected)return {status:'unresolved',reason:'Audio language does not agree across both decodes'};
  if((automaticScores?.[expected]??0)<.8||(confirmedScores?.[expected]??0)<.8)return {status:'unresolved',reason:'Replacement language remains uncertain'};
  if(!speechEvidence(automatic.words,start,end)||!speechEvidence(confirmed.words,start,end))return {status:'unresolved',reason:'Speech coverage or token evidence is insufficient'};
  // Identical text with changed context is deliberately stricter than a fuzzy match.
  if(agreement(autoText)!==agreement(checkText))return {status:'unresolved',reason:'The two audio decodes disagree on wording'};
  const ratio=terms(autoText).length/Math.max(1,terms(original).length);
  if(ratio<.65||ratio>2.5)return {status:'unresolved',reason:'The replacement would remove or add too much speech'};
  const sentenceWords=/^(the|this|that|these|those|and|but|what|where|when|who|how|why|because|you|your|we|our|he|she|they|their|it|it's|its|i|i'm|i'll|i've|my|a|an|is|are|was|were|no|not|yes|well|so|if|can|do|don't|of|in|on|to|for|with)$/i;
  const names=terms(original).slice(1).filter(w=>/^\p{Lu}\p{Ll}/u.test(w)&&!sentenceWords.test(w));
  const replacementWords=terms(autoText).map(agreement);
  if(names.some(name=>!replacementWords.includes(agreement(name))))return {status:'unresolved',reason:'A possible name or capitalized term changed'};
  const oldNeg=terms(original).filter(w=>/^(no|nunca|jamás|sin|sí)$/i.test(w));
  if(expected==='es'&&oldNeg.some(w=>!terms(autoText).some(n=>n.toLowerCase()===w.toLowerCase())))return {status:'unresolved',reason:'An existing negation needs review'};
  return {status:'repaired',reason:'Two local audio decodes with different context agree on source-language wording',text:autoText};
}

export async function guardGeneratedLanguage(cues,audit,context) {
  const result=cues.map(c=>({...c})),changes=[],checks=[],notices=[];
  if(!audit.flags.length)return {cues:result,changes,checks,notices,unresolved:[]};
  if(context.repair===false)return {cues:result,changes,checks,notices:['Automatic language repair is off. Flagged passages retain their original wording.'],unresolved:audit.flags};
  emit({type:'progress',stage:'Finding the local language repair model',fraction:null});
  const model=await findWhisper({progress:fraction=>emit({type:'progress',stage:'Importing verified language repair model',fraction})});
  if(!model)return {cues:result,changes,checks,notices:['Set up the optional language repair model in Speech models, then retry. Flagged passages were preserved.'],unresolved:audit.flags};
  const groups=retryGroups(cues,audit.flags,context.durationMs),unresolved=[];
  for(let index=0;index<groups.length;index++) {
    processingSignal.throwIfAborted();
    const group=groups[index],targets=result.filter(c=>group.ids.includes(c.id));
    emit({type:'progress',stage:'Checking suspicious speech with Whisper',fraction:index/groups.length});
    try {
      const auto=await transcribeWhisper({...context,model,start:group.start,end:group.end,language:'auto',pass:'automatic'});
      // Different acoustic context prevents the second pass from just returning the same decode.
      const checkStart=Math.max(0,group.start-1800),checkEnd=Math.min(context.durationMs,group.end+1800);
      const check=auto.language===audit.expectedLanguage?await transcribeWhisper({...context,model,start:checkStart,end:checkEnd,language:audit.expectedLanguage,pass:'confirmed'}):null;
      const autoWords=wordsInRange(auto.words,group.from,group.to),allocations=allocateWords(autoWords,targets);
      for(let i=0;i<targets.length;i++) {
        const cue=targets[i],words=allocations?.[i]??[],checkWords=check?corroboratingWords(check.words,words,cue.start,cue.end):[];
        const [autoScores,checkScores]=await languageScores([words.map(w=>w.text).join(' '),checkWords.map(w=>w.text).join(' ')],context.directory,'retry-languages');
        const decision=decideLanguageRepair({original:cue.text,automatic:{...auto,words},confirmed:check?{...check,words:checkWords}:null,expected:audit.expectedLanguage,automaticScores:autoScores,confirmedScores:checkScores,start:cue.start,end:cue.end});
        if(decision.status==='repaired') {
          changes.push({type:'language-repair',id:cue.id,before:cue.text,after:decision.text,reason:decision.reason,modelRevision:whisperManifest.revision});cue.text=decision.text;
        }
        if(decision.status==='unresolved')unresolved.push({...audit.flags.find(f=>f.id===cue.id),reason:decision.reason});
        checks.push({ids:[cue.id],start:cue.start,end:cue.end,status:decision.status,reason:decision.reason});
      }
    }catch(error) {
      processingSignal.throwIfAborted();
      unresolved.push(...audit.flags.filter(f=>group.ids.includes(f.id)).map(f=>({...f,reason:'Local language retry failed; original wording retained'})));
      checks.push({ids:group.ids,start:group.from,end:group.to,status:'unresolved',reason:'Local language retry failed; original wording retained',detail:error.message});
    }
  }
  notices.push(`Language check: ${changes.length} captions repaired using local Whisper; ${checks.filter(c=>c.status==='preserved').length} passages corroborated without changes.`);
  return {cues:result,changes,checks,notices,unresolved};
}
