import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { appleFormatting } from '../apple-formatting.mjs';
import { formatCues } from '../formatting-policy.mjs';

const cue={id:'one',start:1000,end:6000,style:'',text:'We should meet outside the old station after the last train.'};
test('disabled cleanup never probes Apple, and unavailable Apple preserves the working result',async()=>{
  let calls=0;
  const run=async()=>{calls++;return JSON.stringify({schema:1,status:'unavailable'});};
  const disabled=await appleFormatting([cue],{enabled:false},{run});
  assert.deepEqual(disabled.cues,[cue]);assert.equal(calls,0);
  const unavailable=await appleFormatting([cue],{}, {run});
  assert.equal(calls,1);assert.equal(unavailable.status,'unavailable');assert.deepEqual(unavailable.cues,[cue]);
});
test('production caches validated native responses by helper and source without changing timings',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'subtitle-format-'));
  let inference=0;
  const run=async(executable,args)=>{
    if(args[0]==='status')return JSON.stringify({schema:1,status:'available',os:'fixture'});
    inference++;
    const requests=JSON.parse(await readFile(args[0],'utf8'));
    assert.ok(requests.every(r=>r.language==='auto'),'Infer subtitle language, never reuse the audio language');
    return requests.map(r=>JSON.stringify({schema:1,id:r.id,mode:r.mode,status:'complete',choice:0})).join('\n');
  };
  try {
    const first=await appleFormatting([cue],{directory,punctuation:false},{run,engineHash:'fixture-v1'});
    assert.equal(inference,1);assert.equal(first.cues[0].start,1000);assert.equal(first.cues[0].end,6000);
    const second=await appleFormatting([cue],{directory,punctuation:false},{run,engineHash:'fixture-v1'});
    assert.equal(inference,1);assert.equal(second.cacheHits,1);assert.deepEqual(second.cues,first.cues);
    await appleFormatting([cue],{directory,punctuation:false},{run,engineHash:'fixture-v2'});assert.equal(inference,2);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('invalid native results preserve original text, and cancellation never becomes a successful fallback',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'subtitle-format-'));
  const controller=new AbortController();
  const run=async(_executable,args)=>{
    if(args[0]==='status')return JSON.stringify({schema:1,status:'available'});
    return 'not a response';
  };
  try {
    const result=await appleFormatting([cue],{directory,punctuation:false},{run,engineHash:'test',signal:controller.signal});
    assert.equal(result.status,'partial');assert.deepEqual(result.cues,[cue]);
    controller.abort();
    await assert.rejects(appleFormatting([cue],{directory},{run,signal:controller.signal}),/abort/i);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('shared policy can isolate layout; protected ASS or speaker text never reaches inference',async()=>{
  let calls=0;
  const input=[{...cue,text:'we wait here'}];
  const generate=async requests=>{calls++;return requests.map(r=>({schema:1,id:r.id,mode:r.mode,status:'complete',text:'We wait here.'}));};
  assert.deepEqual((await formatCues(input,{format:'srt',language:'en',punctuation:false},generate)).cues,input);
  assert.equal(calls,0);
  const revised=await formatCues(input,{format:'srt',language:'en',punctuation:true},generate);
  assert.equal(revised.cues[0].text,'We wait here.');assert.equal(revised.proposals[0].disposition,'review');
  const protectedCue={...cue,text:'{\\k10}we wait here'};
  await formatCues([protectedCue],{format:'ass',language:'auto',punctuation:true},generate);
  assert.equal(calls,1);
});
test('production cleanup automatically polishes punctuation and retains safe layout-only audits',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'subtitle-format-'));
  const run=async(_executable,args)=>{
    if(args[0]==='status')return JSON.stringify({schema:1,status:'available'});
    return JSON.parse(await readFile(args[0],'utf8')).map(r=>JSON.stringify({schema:1,id:r.id,mode:r.mode,status:'complete',text:'We wait here.'})).join('\n');
  };
  try {
    const result=await appleFormatting([{...cue,text:'we wait here'}],{directory},{run,engineHash:'fixture'});
    assert.equal(result.cues[0].text,'We wait here.');
    assert.ok(result.notices.some(n=>n.startsWith('Review punctuation')));
    const wrapped={...cue,text:'We wait\nhere.'};
    const unchanged=await formatCues([wrapped],{format:'srt',language:'en',punctuation:true},async requests=>requests.map(r=>({schema:1,id:r.id,mode:r.mode,status:'complete',text:'We wait here.'})));
    assert.equal(unchanged.proposals[0].disposition,'unchanged');
    assert.deepEqual(unchanged.cues,[wrapped]);
  } finally {await rm(directory,{recursive:true,force:true});}
});
