import path from 'node:path';
import os from 'node:os';
import { readFile, writeFile, mkdir, rm, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { root, binary, run, hashFile, processingSignal } from './process.mjs';
import { store, discoverCandidates, installModel } from './models.mjs';
import { extract } from './media.mjs';

export const whisperManifest=JSON.parse(await readFile(path.join(root,'resources/model-manifests/whisper-turbo.json'),'utf8'));
export const whisperDirectory=path.join(store,'Models',whisperManifest.folder);
export const whisperRuntime='371b5a7561823ab2bb32142d2751e35e7534727b';
export const whisperPolicy=2;
const filename=whisperManifest.files[0].path;
export async function findWhisper({progress=()=>{},signal=processingSignal}={}) {
  const home=os.homedir(),hf=path.join(home,'.cache/huggingface/hub/models--ggerganov--whisper.cpp');
  return discoverCandidates([
    whisperDirectory,
    path.join(home,'Library/Application Support/MacWhisper/models'),
    {source:path.join(home,'Library/Application Support/MacWhisper/models'),aliases:{[filename]:'ggml-model-whisper-turbo.bin'}},
    path.join(home,'Library/Application Support/whisper.cpp/models'),path.join(home,'Downloads'),
    {source:path.join(hf,'snapshots',whisperManifest.revision),cacheRoot:hf},
  ],{inventory:whisperManifest,destination:whisperDirectory,progress,signal});
}
export async function installWhisper(source, options={}) {
  let aliases={};
  if(source&&(await lstat(source)).isFile()) {aliases={[filename]:path.basename(source)};source=path.dirname(source);}
  return installModel(source,{...options,inventory:whisperManifest,destination:whisperDirectory,aliases});
}

export function whisperCacheKey({start,end,language,pass}) {
  return createHash('sha256').update(JSON.stringify({start,end,language,pass,model:whisperManifest.revision,weights:whisperManifest.files[0].sha256,runtime:whisperRuntime,policy:whisperPolicy})).digest('hex');
}
export function parseWhisper(result, {start,end}) {
  if(!Array.isArray(result.transcription)||result.transcription.length>1000||typeof result.result?.language!=='string')throw new Error('Invalid fallback speech result.');
  const words=[];
  for(const segment of result.transcription) {
    if(!Array.isArray(segment.tokens)||typeof segment.text!=='string')throw new Error('Invalid fallback speech tokens.');
    let word;
    const flush=()=>{if(word&&word.text.trim())words.push(word);word=undefined;};
    for(const token of segment.tokens) {
      if(!Number.isInteger(token.id)||token.id<0||typeof token.text!=='string')throw new Error('Invalid fallback token.');
      if(token.id>=50257)continue; // Whisper's special tokens are not speech.
      // DTW provides acoustic token anchors. Legacy t0/t1 can be inverted; never use them.
      // Anchors allocate wording to existing cues, not new subtitle durations.
      const from=token.t_dtw*10,to=from;
      if(!Number.isFinite(token.t_dtw)||from<0||to>end-start+300||!Number.isFinite(token.p)||token.p<0||token.p>1)throw new Error('Invalid fallback speech timing.');
      if(!/[\p{L}\p{N}]/u.test(token.text)&&word) {word.text+=token.text.trim();continue;}
      if(/^\s/u.test(token.text)||/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(token.text))flush();
      if(!word)word={text:'',startsAtMs:start+from,endsAtMs:start+to,confidence:token.p};
      word.text+=token.text.trimStart();word.endsAtMs=Math.min(end,Math.max(word.endsAtMs,start+to));word.confidence=Math.min(word.confidence,token.p);
    }
    flush();
  }
  if(words.some((w,i)=>w.text.length>2000||(i>0&&w.startsAtMs<words[i-1].startsAtMs)))throw new Error('Invalid fallback word order.');
  return {language:result.result.language,words};
}

export async function transcribeWhisper({video,stream,start,end,language='auto',pass='check',model,directory}) {
  const key=whisperCacheKey({start,end,language,pass}),folder=path.join(directory,'language-retry-v1',key);
  await mkdir(folder,{recursive:true,mode:0o700});
  const output=path.join(folder,'speech.json'),receipt=output+'.receipt',audio=path.join(folder,'audio.wav');
  try {
    const saved=JSON.parse(await readFile(receipt,'utf8'));
    if(saved.key===key&&saved.sha256===await hashFile(output))return parseWhisper(JSON.parse(await readFile(output,'utf8')),{start,end});
  }catch{}
  processingSignal.throwIfAborted();
  await rm(audio,{force:true});await rm(output,{force:true});
  try {
    await extract(video,stream,start,end-start,audio);
    await run(binary('whisper-cli'),['-m',path.join(model,filename),'-f',audio,'-l',language,'-ojf','-of',path.join(folder,'speech'),'-np','-mc','0','-nf','-dtw','large.v3.turbo','-nfa']);
    const result=parseWhisper(JSON.parse(await readFile(output,'utf8')),{start,end});
    processingSignal.throwIfAborted();
    await writeFile(receipt,JSON.stringify({key,sha256:await hashFile(output)}),{mode:0o600});
    return result;
  } finally {await rm(audio,{force:true});}
}
