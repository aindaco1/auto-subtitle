import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSamples, findLanguageFlags, retryGroups, decideLanguageRepair, allocateWords, corroboratingWords } from '../language-guard.mjs';
import { parseWhisper, whisperCacheKey } from '../whisper.mjs';

const cue=(id,start,end,text)=>({id,start,end,text});
test('Spanish dominant text cannot conceal English passages, and audit leaves text intact',()=>{
  const cues=[cue('es',0,5000,'Esta conversación sigue en español.'),cue('en',6000,11000,'The answer is over there.'),cue('short',12000,13000,'Will.')];
  const copy=structuredClone(cues),samples=auditSamples(cues);
  const flags=findLanguageFlags(cues,samples,samples.map(s=>s.id==='en'?{en:.98,es:.01}:{es:.99}),'es');
  assert.deepEqual(flags.map(f=>f.id),['en']);assert.deepEqual(cues,copy);
  assert.deepEqual(findLanguageFlags(cues,samples,samples.map(()=>({en:.99})),'und'),[]);
});
test('Sliding text windows catch a foreign phrase inside a longer Spanish caption',()=>{
  const cues=[cue('mixed',0,7000,'Estamos hablando en español but the answer is over there y seguimos hablando.')];
  const samples=auditSamples(cues);
  assert.ok(samples.length>1);
  const scores=samples.map(s=>s.text==='but the answer is over'?{en:.97}:{es:.98});
  assert.equal(findLanguageFlags(cues,samples,scores,'es').length,1);
});
test('Retries are bounded, never span unrelated captions, and clamp to media duration',()=>{
  const cues=[cue('a',0,5000,'A'),cue('b',5200,10000,'B'),cue('c',11000,12000,'C'),cue('d',12500,16000,'D')];
  const groups=retryGroups(cues,[cues[0],cues[1],cues[3]],18000);
  assert.equal(groups.length,2);assert.deepEqual(groups[0].ids,['a','b']);assert.equal(groups[0].start,0);assert.equal(groups[1].end,18000);
});
const speech=(text,language='es')=>({language,words:text.split(' ').map((text,i)=>({text,startsAtMs:i*300,endsAtMs:i*300+250,confidence:.98}))});
const base=()=>({original:'The answer is under the table.',automatic:speech('La respuesta está debajo de la mesa.'),confirmed:speech('La respuesta está debajo de la mesa.'),expected:'es',automaticScores:{es:.99},confirmedScores:{es:.99},start:0,end:2100});
test('Language repair requires acoustic agreement and retains real English speech',()=>{
  assert.equal(decideLanguageRepair(base()).status,'repaired');
  const english=speech('The answer is under the table.','en');
  assert.equal(decideLanguageRepair({...base(),automatic:english,confirmed:null,automaticScores:{en:.99}}).status,'preserved');
  assert.equal(decideLanguageRepair({...base(),automatic:{...base().automatic,language:'en'}}).status,'unresolved');
  assert.equal(decideLanguageRepair({...base(),confirmed:speech('La respuesta no está debajo de la mesa.')}).status,'unresolved');
});
test('Low evidence, missing speech, language uncertainty and lost negation cannot be repaired',()=>{
  assert.equal(decideLanguageRepair({...base(),automatic:{language:'es',words:[]}}).status,'unresolved');
  const poor=base();poor.automatic.words[2].confidence=.01;assert.equal(decideLanguageRepair(poor).status,'unresolved');
  assert.equal(decideLanguageRepair({...base(),automaticScores:{es:.4,en:.5}}).status,'unresolved');
  assert.equal(decideLanguageRepair({...base(),end:9000}).status,'unresolved');
  assert.equal(decideLanguageRepair({...base(),original:'No, the answer is under the table.'}).status,'unresolved');
  assert.equal(decideLanguageRepair({...base(),original:'Sí, the answer is under the table.'}).status,'unresolved');
  assert.equal(decideLanguageRepair({...base(),original:'The answer from Rodrigo is under the table.'}).status,'unresolved');
});
test('Cue gaps do not lose words and context shifts cannot substitute a different phrase',()=>{
  const cues=[cue('a',0,1000,'One'),cue('b',1080,2100,'Two')];
  const words=[{text:'Hola',startsAtMs:1040,endsAtMs:1040}];
  assert.equal(allocateWords(words,cues).flat().length,1);
  assert.equal(allocateWords([{...words[0],startsAtMs:3000,endsAtMs:3000}],cues),null);
  const automatic=speech('Qué dijo sobre el Perú.').words,confirmed=speech('que dijo sobre el Peru.').words;
  assert.equal(corroboratingWords(confirmed,automatic,0,1500).length,automatic.length);
  const different=speech('Qué dijo sobre el futuro.').words;
  assert.notEqual(corroboratingWords(different,automatic,0,1500).map(w=>w.text).join(' '),automatic.map(w=>w.text).join(' '));
});
test('Fallback parser joins subwords and punctuation while excluding timestamp tokens',()=>{
  const token=(text,id,from,to,p=.95)=>({text,id,p,t_dtw:from/10,offsets:{from,to}});
  const result={result:{language:'es'},transcription:[{text:' Hola, señor.',tokens:[token('[_BEG_]',50365,0,0),token(' Hola',10,100,300),token(',',11,300,300),token(' señ',12,400,500),token('or',13,500,700),token('.',14,700,700),token('[_TT_]',50400,700,700)]}]};
  const parsed=parseWhisper(result,{start:10000,end:12000});
  assert.deepEqual(parsed.words.map(w=>[w.text,w.startsAtMs,w.endsAtMs]),[['Hola,',10100,10100],['señor.',10400,10500]]);
  result.transcription[0].tokens[1].offsets={from:5000,to:-200};assert.doesNotThrow(()=>parseWhisper(result,{start:0,end:2000}));
  result.transcription[0].tokens[1].t_dtw=-1;assert.throws(()=>parseWhisper(result,{start:0,end:2000}),/timing/);
});
test('Recognition cache separates effective languages and context passes',()=>{
  const request={start:0,end:30000,language:'auto',pass:'automatic'};
  const keys=[request,{...request,language:'es'},{...request,pass:'confirmed'},{...request,start:500}].map(whisperCacheKey);
  assert.equal(new Set(keys).size,4);assert.equal(whisperCacheKey(request),keys[0]);
});
