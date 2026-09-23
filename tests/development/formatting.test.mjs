import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixtures, fixtureHash, calibrationHash, protocolHash, digest, baseline, applyProposal, evaluateOutput, prepareJev, sameWords, choices, summarize, literalFailures } from '../../scripts/lib/subtitle-evaluation.mjs';
import { evaluateJevCases } from '../../shared/dust-wave-platform/packages/test-core/src/jev.js';
import { safeWordingCandidate, dictionaryAllowsCorrection } from '../../engine/recognition.mjs';
const report=()=>({schema:'auto-subtitle.formatting.v1',fixtureHash,provider:'deterministic',cases:fixtures.map(f=>{
  const {cues}=baseline(f);return {id:f.id,sourceHash:digest(f.source),outputHash:digest(cues),cues,...evaluateOutput(f,cues),native:[],proposals:[]};
})});

test('public English/Spanish/translated SRT and ASS corpus satisfies deterministic contracts',()=>{
  const value=report();
  assert.ok(value.cases.every(c=>c.failures.length===0),JSON.stringify(value.cases.filter(c=>c.failures.length)));
  assert.equal(prepareJev(value).length,fixtures.length);
});
test('the frozen subtitle policy matches the public corpus, calibration and actual request protocol',async()=>{
  const policy=JSON.parse(await readFile(new URL('../fixtures/jev-policy.json',import.meta.url),'utf8'));
  assert.equal(policy.fixtureHash,fixtureHash);assert.equal(policy.calibrationHash,calibrationHash);assert.equal(policy.protocolHash,protocolHash);
});
test('saved evidence rejects changed source, missing cases and private candidate text before requests',()=>{
  for(const mutate of [r=>r.fixtureHash='stale',r=>r.cases.pop(),r=>r.cases[0].sourceHash='unknown',r=>{
    r.cases[0].cues[0].text='Private new transcript';r.cases[0].outputHash=digest(r.cases[0].cues);
  }]) {
    const value=report();mutate(value);assert.throws(()=>prepareJev(value));
  }
});
test('punctuation review preserves words, accents, negation, protected symbols and numeric values',()=>{
  assert.ok(sameWords('si no viene ana nos quedamos aquí','Si no viene Ana, nos quedamos aquí.'));
  for(const [a,b] of [['I cannot go','I can go'],['sí','si'],['1.5 mg','15 mg'],['1.5 mg','1,5 mg'],["don't go",'dont go'],['well-known','well known'],['We wait','We\u202E wait'],['$5','5'],['He said "go"','He said go']]) assert.equal(sameWords(a,b),false);
  const fixture=fixtures.find(f=>f.punctuation),cue=baseline(fixture).cues[0];
  const request={id:'surface',mode:'punctuation'};
  const result=applyProposal(fixture,cue,{schema:1,id:'surface',mode:'punctuation',status:'complete',text:'We should wait here until María arrives.'},request);
  assert.equal(result.disposition,'review');assert.equal(result.cue.start,cue.start);assert.equal(result.cue.end,cue.end);
});
test('layout uses only exact original strings; invalid native choices retain source',()=>{
  const fixture=fixtures[0],cue=baseline(fixture).cues[0],options=choices(cue.text);
  assert.ok(options.length>1);
  const request={id:'choice',mode:'layout',options};
  const response={schema:1,id:'choice',mode:'layout',status:'complete',choice:1};
  const result=applyProposal(fixture,cue,response,request);
  assert.equal(result.cue.text,options[1]);assert.equal(result.cue.start,cue.start);assert.equal(result.cue.end,cue.end);
  for(const changed of [{choice:999},{choice:-1},{choice:0.5},{id:'wrong'},{status:'error'}]) assert.equal(applyProposal(fixture,cue,{...response,...changed},request).cue.text,cue.text);
});
test('protected ASS and speaker/lyric/unsupported-language cases never accept model edits',()=>{
  for(const fixture of fixtures.filter(f=>f.protected)) {
    const cue=baseline(fixture).cues[0];
    assert.equal(applyProposal(fixture,cue,{text:'new words'},{}).disposition,'skipped');
  }
});
test('Jev previews and native fallback cannot become combined passes',async()=>{
  const value=report(),cases=prepareJev(value);
  const preview=await evaluateJevCases(cases,{policy:{minimumMargin:0.1,models:[]}});
  assert.equal(preview.networkAttempts,0);assert.equal(summarize(value,preview).passed,false);
  value.provider='apple-prototype';value.cases[0].native=[{status:'error'}];
  const jev={complete:true,cases:[{result:{findings:{good:{decision:'pass'}}}}]};
  assert.equal(summarize(value,jev).passed,false);
  value.cases[0].native=[{status:'complete'}];value.cases[0].proposals=[{disposition:'rejected'}];
  assert.equal(summarize(value,jev).passed,false);
  value.provider='deterministic';value.cases[0].failures=['Timing changed'];
  assert.equal(summarize(value,jev).passed,false);
});
test('audio-supported correction safeguards remain authoritative for spelling, independent of Apple punctuation',()=>{
  const source='Please turn that ligth off',candidate='Please turn that light off';
  assert.equal(sameWords(source,candidate),false,'Text-only Apple cannot authorize even a plausible correction');
  assert.ok(safeWordingCandidate(source,candidate,[{confidence:.99}]));
  assert.ok(dictionaryAllowsCorrection(source,candidate,{available:true,misspelled:['ligth']}));
  assert.equal(safeWordingCandidate(source,candidate,[]),false);
  assert.equal(dictionaryAllowsCorrection(source,candidate,{available:false}),false);
  // These are synthetic gate checks, not real audio or correction-precision measurements.
});
test('punctuation retains deterministic wrapping when only one valid break exists',()=>{
  const source='A'.repeat(40)+' '+ 'b'.repeat(40);
  const cue={id:'one-break',start:0,end:7000,text:source};
  const request={id:cue.id,mode:'punctuation'};
  const result=applyProposal({format:'srt',language:'en',punctuation:true},cue,{schema:1,...request,status:'complete',text:source+'.'},request);
  assert.equal(choices(source+'.').length,1);
  assert.equal(result.cue.text,'A'.repeat(40)+'\n'+'b'.repeat(40)+'.');
});


test('literal formatting checks accept comma continuations and reject sentence stops and broken phrases',()=>{
  const continuation=fixtures.find(f=>f.id==='english-continuation');
  for(const mark of [',',';',':','']) assert.deepEqual(literalFailures(continuation,[{text:'If Ana comes'+mark},{text:'we can leave together.'}]),[]);
  for(const mark of ['.','!','?','…','.”']) assert.equal(literalFailures(continuation,[{text:'If Ana comes'+mark}]).length,1);
  const phrase=fixtures.find(f=>f.id==='english-phrase');
  assert.deepEqual(literalFailures(phrase,[{text:'We should meet outside the old station\nafter the last train.'}]),[]);
  assert.ok(literalFailures(phrase,[{text:'We should meet outside the old\nstation after the last train.'}]).length);
  assert.ok(literalFailures(fixtures.find(f=>f.id==='spanish-question'),[{text:'No viene Ana.'}]).length===2);
  assert.ok(literalFailures(fixtures.find(f=>f.id==='spanish-negation'),[{text:'no quiero salir todavía'}]).length===2);
});
test('missing Jev cases or requirement findings cannot pass even if complete is asserted',()=>{
  const value=report();value.cases.forEach(c=>c.formattingFailures=[]);
  const cases=fixtures.map(f=>({id:f.id,result:{findings:Object.fromEntries(Object.keys(f.requirements).map(k=>[k,{decision:'pass'}]))}}));
  assert.equal(summarize(value,{complete:true,cases}).passed,true);
  assert.equal(summarize(value,{complete:true,cases:cases.slice(1)}).passed,false);
  cases[0].result.findings={};
  assert.equal(summarize(value,{complete:true,cases}).passed,false);
});
