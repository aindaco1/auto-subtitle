import { runCapturedProcess } from '../shared/dust-wave-platform/packages/node-core/src/process.js';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const runtime = path.join(root, 'runtime/macos-arm64');
export const binary = name => path.join(runtime, 'bin', name);
export const children = new Set();
const processing = new AbortController();
export const processingSignal = processing.signal;
export const emit = value => process.stdout.write(JSON.stringify(value)+'\n');
export function cancelChildren() {
  processing.abort(new Error('Processing was cancelled.'));
}
export function run(executable, args, { onEvent, signal, maxBytes=32*1024*1024 }={}) {
  processing.signal.throwIfAborted();
  signal = signal ? AbortSignal.any([processing.signal,signal]) : processing.signal;
  if (!path.isAbsolute(executable)) throw new Error('A bundled executable is required.');
  let err='',pending='';
  return runCapturedProcess(executable,args,{
    processGroup:true,signal,abortGraceMs:1500,maximumOutputBytes:maxBytes,
    env:{...process.env,PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1',HF_HUB_OFFLINE:'1',TOKENIZERS_PARALLELISM:'false'},
    onSpawn:child=>children.add(child),onClose:child=>children.delete(child),
    streams:[
      {name:'stdout',onData:bytes=>{
        pending+=bytes.toString();
        while(pending.includes('\n')) {
          const index=pending.indexOf('\n'),line=pending.slice(0,index);pending=pending.slice(index+1);
          if(onEvent) {try {onEvent(JSON.parse(line));} catch {}}
        }
      }},
      {name:'stderr',capture:false,budget:false,onData:bytes=>{err=(err+bytes.toString()).slice(-12000);}}
    ],
    errors:{
      spawn:({error})=>error,
      abort:({reason})=>Object.assign(new Error('The operation was aborted',{cause:reason}),{name:'AbortError',code:'ABORT_ERR'}),
      limit:()=>new Error('A processing tool returned too much data.'),
      exit:({code,signal:sig})=>{
        const tool=({'auto-subtitle-speech':'speech','whisper-cli':'speech','python3.11':'sync','ffmpeg':'ffmpeg','ffprobe':'ffprobe'})[path.basename(executable)]??'engine';
        return Object.assign(new Error(processing.signal.aborted?'Processing was cancelled.':sig?`${tool} stopped unexpectedly (${sig}).`:err.trim()||`${tool} failed (${code}).`),{tool,signal:sig??'none',exitCode:code??-1});
      }
    }
  }).then(result=>result.stdout);
}
export async function hashFile(file) {
  const hash=createHash('sha256');
  for await(const block of createReadStream(file)) {processing.signal.throwIfAborted();hash.update(block);}
  return hash.digest('hex');
}
