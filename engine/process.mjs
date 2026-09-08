import { spawn } from 'node:child_process';
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
  for (const child of children) { try { process.kill(-child.pid,'SIGTERM'); } catch {} }
  setTimeout(() => { for (const child of children) { try { process.kill(-child.pid,'SIGKILL'); } catch {} } },1500).unref();
}
export function run(executable, args, { onEvent, signal, maxBytes=32*1024*1024 }={}) {
  processing.signal.throwIfAborted();
  signal = signal ? AbortSignal.any([processing.signal,signal]) : processing.signal;
  if (!path.isAbsolute(executable)) throw new Error('A bundled executable is required.');
  return new Promise((resolve,reject) => {
    const child=spawn(executable,args,{shell:false,detached:true,signal,env:{...process.env,PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1',HF_HUB_OFFLINE:'1',TOKENIZERS_PARALLELISM:'false'},stdio:['ignore','pipe','pipe']});
    children.add(child);
    let out='',err='',pending='',size=0;
    child.stdout.on('data',bytes=>{
      size+=bytes.length;
      if(size>maxBytes) { try{process.kill(-child.pid,'SIGKILL');}catch{}; reject(new Error('A processing tool returned too much data.')); return; }
      out+=bytes.toString(); pending+=bytes.toString();
      while(pending.includes('\n')) {
        const index=pending.indexOf('\n'),line=pending.slice(0,index); pending=pending.slice(index+1);
        if(onEvent) { try {onEvent(JSON.parse(line));} catch {} }
      }
    });
    child.stderr.on('data',b=>{err=(err+b.toString()).slice(-12000);});
    child.on('error',reject);
    child.on('close',(code,sig)=>{
      children.delete(child);
      if(code===0) resolve(out);
      else {
        const tool=({'auto-subtitle-speech':'speech','whisper-cli':'speech','python3.11':'sync','ffmpeg':'ffmpeg','ffprobe':'ffprobe'})[path.basename(executable)]??'engine';
        reject(Object.assign(new Error(processing.signal.aborted?'Processing was cancelled.':sig?`${tool} stopped unexpectedly (${sig}).`:err.trim()||`${tool} failed (${code}).`),{tool,signal:sig??'none',exitCode:code??-1}));
      }
    });
  });
}
export async function hashFile(file) {
  const hash=createHash('sha256');
  for await(const block of createReadStream(file)) {processing.signal.throwIfAborted();hash.update(block);}
  return hash.digest('hex');
}
