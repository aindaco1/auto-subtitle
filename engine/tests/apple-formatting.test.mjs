import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { appleFormatting } from '../apple-formatting.mjs';
import { formatCues, applyProposal, preservesPunctuation, splitPunctuation } from '../formatting-policy.mjs';

test('existing punctuation cannot move negation, change questions or erase uncertainty',()=>{
  for(const [source,candidate] of [['No, quiero ir.','No quiero ir.'],['Can you wait?','Can you wait.'],['¿Viene Ana?','Viene Ana.'],['Well... maybe.','Well, maybe.']]) {
    assert.equal(preservesPunctuation(source,candidate),false);
    const cue={id:'meaning',text:source,start:0,end:5000};
    const request={id:cue.id,mode:'punctuation'};
    const result=applyProposal({format:'srt',language:'en',punctuation:true},cue,{schema:1,...request,status:'complete',text:candidate},request);
    assert.equal(result.disposition,'rejected');assert.deepEqual(result.cue,cue);
  }
  assert.equal(preservesPunctuation('we wait for ana','We wait for Ana.'),true);
});
test('continuous caption fragments share punctuation inference without moving words or timings',async()=>{
  const input=[{id:'a',start:0,end:2000,text:'if ana comes'}, {id:'b',start:2000,end:4000,text:'we can leave'}];
  const requests=[];
  const generate=async rows=>{requests.push(...rows);return rows.map(r=>({schema:1,id:r.id,mode:r.mode,status:'complete',text:'If Ana comes, we can leave.'}));};
  const result=await formatCues(input,{format:'srt',language:'en',punctuation:true},generate);
  assert.deepEqual(requests.map(r=>r.source),['if ana comes we can leave']);
  assert.deepEqual(result.cues.map(c=>c.text),['If Ana comes,','we can leave.']);
  assert.deepEqual(result.cues.map(c=>[c.start,c.end]),[[0,2000],[2000,4000]]);
  assert.deepEqual(input.map(c=>c.text),['if ana comes','we can leave']);
  for(const change of [{start:5001},{start:1999},{text:'- Another speaker'},{style:'other'},{text:'x'.repeat(500)}]) {
    requests.length=0;
    await formatCues([input[0],{...input[1],...change}],{format:'srt',language:'en',punctuation:true},generate);
    assert.equal(requests[0].source,'if ana comes');
  }
});
test('phrase projection fails atomically for rewritten words or moved punctuation',()=>{
  assert.deepEqual(splitPunctuation(['si no viene ana','nos quedamos aquí'],'Si no viene Ana, nos quedamos aquí.'),['Si no viene Ana,','nos quedamos aquí.']);
  assert.equal(splitPunctuation(['if ana comes','we can leave'],'We can leave if Ana comes.'),null);
  assert.equal(splitPunctuation(['No, quiero ir.','¿Vienes tú?'],'No quiero ir. Vienes tú.'),null);
  assert.deepEqual(splitPunctuation(['Ya viene','¿Vienes tú?'],'Ya viene. ¿Vienes tú?'),['Ya viene.','¿Vienes tú?']);
});
test('already capitalized complete captions keep their punctuation without another model call',async()=>{
  const input=[{id:'en',start:0,end:2000,text:'You can wait, can you not?'},{id:'es',start:3000,end:5000,text:'¿No viene Ana?'}];
  const result=await formatCues(input,{format:'srt',language:'auto',punctuation:true},async()=>{throw Error('Unnecessary inference');});
  assert.deepEqual(result.cues,input);assert.equal(result.native.length,0);
});

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
  let model='fixture-model-1';
  const run=async(executable,args)=>{
    if(args[0]==='status')return JSON.stringify({schema:1,status:'available',os:'fixture',model});
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
    model='fixture-model-2';
    await appleFormatting([cue],{directory,punctuation:false},{run,engineHash:'fixture-v2'});assert.equal(inference,3);
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
    assert.equal(unchanged.proposals.length,0);
    assert.deepEqual(unchanged.cues,[wrapped]);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('one source-derived recovery can finish a rewritten draft without accepting its words',async()=>{
  const input=[{id:'negation',start:0,end:5000,text:'no quiero salir todavía'}],calls=[];
  const result=await formatCues(input,{format:'srt',language:'es',punctuation:true},async requests=>{
    calls.push(requests);
    return requests.map(r=>r.options.length?{schema:1,id:r.id,mode:r.mode,status:'complete',choice:0}:
      {schema:1,id:r.id,mode:r.mode,status:'complete',language:'es',text:'NO QUIERO SALIR AÚN.'});
  });
  assert.equal(calls.length,2);assert.deepEqual(calls[1][0].options,['No quiero salir todavía.','No quiero salir todavía','¿No quiero salir todavía?']);
  assert.equal(result.cues[0].text,'No quiero salir todavía.');
  assert.equal(result.native[0].recovery.draft.text,'NO QUIERO SALIR AÚN.');
  assert.equal(result.native[0].recovery.accepted,true);
  assert.deepEqual([result.cues[0].start,result.cues[0].end],[0,5000]);
});
test('a failed bounded recovery retains the source and remains rejected without further retries',async()=>{
  let calls=0;
  const input=[{id:'negation',start:0,end:5000,text:'no quiero salir todavía'}];
  const result=await formatCues(input,{format:'srt',language:'es',punctuation:true},async requests=>{
    calls++;return requests.map(r=>({schema:1,id:r.id,mode:r.mode,status:'complete',text:'Quiero salir.',choice:999}));
  });
  assert.equal(calls,2);assert.deepEqual(result.cues,input);
  assert.equal(result.proposals[0].disposition,'rejected');
  assert.equal(result.native[0].recovery.accepted,false);
});

test('new shouting is rejected while existing acronyms and internal name casing survive',()=>{
  const check=(source,text)=>{
    const cue={id:'case',start:0,end:5000,text:source},request={id:'case',mode:'punctuation'};
    return applyProposal({format:'srt',language:'en',punctuation:true},cue,{schema:1,...request,status:'complete',text},request).disposition;
  };
  assert.equal(check('no podemos esperar más','NO PODEMOS ESPERAR MÁS.'),'rejected');
  assert.equal(check('no debemos cambiar la fecha','NO debemos cambiar la fecha.'),'rejected');
  assert.equal(check('we use NASA and iOS','We use NASA and iOS.'),'review');
  assert.equal(check('i will ask McDonald','I will ask McDonald.'),'review');
});
