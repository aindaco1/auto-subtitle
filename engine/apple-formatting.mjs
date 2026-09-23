import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { binary, run, hashFile, emit, processingSignal } from './process.mjs';
import { formatCues } from './formatting-policy.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function appleFormatting(cues,{directory,format='srt',punctuation=true,enabled=true},transport={}) {
  if(!enabled)return {cues,native:[],proposals:[],notices:[],status:'disabled'};
  const executable=transport.executable??binary('auto-subtitle-format');
  const invoke=transport.run??run, signal=transport.signal??processingSignal;
  const notices=[];
  signal.throwIfAborted();
  let status,engineHash;
  try {
    status=JSON.parse(await invoke(executable,['status'],{signal:AbortSignal.any([signal,AbortSignal.timeout(10_000)]),maxBytes:65536}));
    if(status.schema!==1||status.status!=='available')throw Error('unavailable');
    engineHash=transport.engineHash??await hashFile(executable);
  } catch {
    signal.throwIfAborted();
    return {cues,native:[],proposals:[],status:'unavailable',notices:['Apple Intelligence formatting is unavailable. Standard formatting was used.']};
  }
  const cache=path.join(directory,'apple-formatting-v1');
  await mkdir(cache,{recursive:true,mode:0o700});
  let requestsRun=0,cacheHits=0;
  const generate=async requests=>{
    const rows=new Array(requests.length), pending=[];
    for(const [index,request] of requests.entries()) {
      signal.throwIfAborted();
      const key=digest({request:{...request,id:null},engineHash,os:status.os??os.release(),policy:1});
      const file=path.join(cache,key+'.json');
      try {
        const saved=JSON.parse(await readFile(file,'utf8'));
        if(saved.key===key&&saved.response?.schema===1&&saved.response.status==='complete'&&saved.hash===digest(saved.response)) {
          rows[index]={...saved.response,id:request.id,cached:true};cacheHits++;continue;
        }
      } catch {}
      pending.push({index,request,key,file});
    }
    for(let start=0;start<pending.length;start+=8) {
      signal.throwIfAborted();
      const batch=pending.slice(start,start+8),input=path.join(cache,'request-'+randomUUID()+'.json');
      await writeFile(input,JSON.stringify(batch.map(p=>p.request)),{mode:0o600});
      let responses=[];
      try {
        emit({type:'progress',stage:'Improving subtitle formatting with Apple Intelligence',fraction:start/pending.length});
        requestsRun+=batch.length;
        const raw=await invoke(executable,[input],{signal:AbortSignal.any([signal,AbortSignal.timeout(60_000)]),maxBytes:1024*1024,
          onEvent:row=>{if(row.schema===1)emit({type:'progress',stage:'Improving subtitle formatting with Apple Intelligence',fraction:null});}});
        responses=raw.trim().split('\n').map(line=>JSON.parse(line));
        if(responses.length!==batch.length||responses.some((r,i)=>r.id!==batch[i].request.id||r.mode!==batch[i].request.mode))throw Error('Invalid batch');
      } catch {
        signal.throwIfAborted();
        responses=batch.map(({request})=>({schema:1,id:request.id,mode:request.mode,status:'error',reason:'Formatting request failed or timed out; standard formatting retained'}));
      } finally {await rm(input,{force:true});}
      for(const [i,entry] of batch.entries()) {
        rows[entry.index]=responses[i];
        if(responses[i].status==='complete') {
          const temporary=entry.file+'.'+randomUUID()+'.tmp';
          await writeFile(temporary,JSON.stringify({key:entry.key,response:responses[i],hash:digest(responses[i])}),{mode:0o600});
          await rename(temporary,entry.file);
        }
      }
    }
    return rows;
  };
  // Use subtitle text's language, never the audio language for translated captions.
  const result=await formatCues(cues,{format,language:'auto',punctuation},generate);
  const changed=result.proposals.filter(p=>p.before!==p.after);
  const retained=result.proposals.filter(p=>['retained','rejected'].includes(p.disposition));
  if(changed.length)notices.push(`Apple Intelligence adjusted ${new Set(changed.map(c=>c.id)).size} captions. Changes are recorded in the local report.`);
  if(changed.some(c=>c.mode==='punctuation'))notices.push('Review punctuation and capitalization changes against the dialogue before saving.');
  if(retained.length)notices.push(`Standard wording/layout was retained for ${new Set(retained.map(c=>c.id)).size} captions that Apple Intelligence could not safely format.`);
  return {...result,notices,status:retained.length?'partial':'complete',requestsRun,cacheHits};
}
