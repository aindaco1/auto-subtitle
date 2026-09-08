#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { runJob } from './job.mjs';
import { probe } from './media.mjs';
import { discoverModel, installModel } from './models.mjs';
import { emit, cancelChildren } from './process.mjs';
import { prepareDiagnostic, sendDiagnostic } from './diagnostics.mjs';
import { findWhisper, installWhisper } from './whisper.mjs';

const controller=new AbortController();
let cancelled=false;
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{cancelled=true;controller.abort();cancelChildren();setTimeout(()=>{cancelChildren();process.exit(130);},2000).unref();});
try {
  const [command,arg]=process.argv.slice(2);
  if(command==='probe')emit({type:'media',...await probe(arg)});
  else if(command==='diagnostic')emit(await prepareDiagnostic(arg,process.argv[4]));
  else if(command==='send-report')emit(await sendDiagnostic(arg));
  else if(command==='model-status')emit({type:'model',path:await discoverModel()});
  else if(command==='model-install')emit({type:'model',path:await installModel(arg,{signal:controller.signal,progress:fraction=>emit({type:'progress',stage:arg?'Importing speech model':'Downloading speech model',fraction})})});
  else if(command==='whisper-status')emit({type:'whisper-model',path:await findWhisper({signal:controller.signal,progress:fraction=>emit({type:'progress',stage:'Importing language repair model',fraction})})});
  else if(command==='whisper-install')emit({type:'whisper-model',path:await installWhisper(arg,{signal:controller.signal,progress:fraction=>emit({type:'progress',stage:arg?'Importing language repair model':'Downloading language repair model',fraction})})});
  else if(command==='run') {
    const raw=await readFile(arg);if(raw.length>32768)throw new Error('Job request is too large.');
    await runJob(JSON.parse(raw));
  } else {emit({type:'help',usage:'auto-subtitle run REQUEST.json | probe VIDEO | model-status | model-install [FOLDER]'});process.exitCode=2;}
}catch(error){emit({type:'error',message:cancelled?'Cancelled. Your original files are unchanged.':error.message,code:typeof error.code==='string'?error.code:'PROCESSING_FAILED',tool:error.tool,signal:error.signal,exitCode:error.exitCode});process.exitCode=cancelled?130:1;}
