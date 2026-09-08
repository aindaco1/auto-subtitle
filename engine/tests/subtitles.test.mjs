import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubtitle, renderSubtitle, decodeSubtitle, timestamp } from '../subtitles.mjs';
import { cleanCues, generatedCues, wrap } from '../quality.mjs';
import { applyTiming } from '../job.mjs';
import { similarity, safeWordingCandidate, preserveWordingSurface, phraseWords, dictionaryAllowsCorrection } from '../recognition.mjs';

const srt=(text='¿Dónde está?\nAquí mismo.')=>`1\r\n00:00:01,230 --> 00:00:03,450\r\n${text.replaceAll('\n','\r\n')}\r\n`;
test('Dictionary corroboration preserves valid words and fails closed when unavailable',()=>{
  assert.equal(dictionaryAllowsCorrection('Please turn that ligth off','Please turn that light off',{available:true,misspelled:['ligth']}),true);
  assert.equal(dictionaryAllowsCorrection('Please turn that light off','Please turn that night off',{available:true,misspelled:[]}),false);
  assert.equal(dictionaryAllowsCorrection('Please turn that ligth off','Please turn that light off',{available:false,misspelled:['ligth']}),false);
  assert.equal(dictionaryAllowsCorrection('Please turn that ligth off','Please turn that light off',{available:true,misspelled:['ligth','light']}),false);
});
const ass='[Script Info]\r\nTitle: Example\r\n[V4+ Styles]\r\nFormat: Name, Fontname, Fontsize\r\nStyle: Fancy,Arial,40\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nComment: 0,0:00:00.00,0:00:01.00,Fancy,,0,0,0,,leave me\r\nDialogue: 2,0:00:01.23,0:00:03.45,Fancy,Speaker,1,2,3,,{\\i1}Hello, world!\\NSecond line.\r\n';
test('SRT timing-only round trip retains Unicode, punctuation and line breaks',()=>{
  const doc=parseSubtitle(srt());assert.equal(renderSubtitle(doc,doc.cues),srt());
  const c=applyTiming(doc.cues,{accepted:true,transform:{scale:1,offset:2}},10000).cues;
  assert.equal(c[0].text,doc.cues[0].text);assert.match(renderSubtitle(doc,c),/00:00:03,230 --> 00:00:05,450/);
});
test('ASS round trip preserves all unrelated bytes, comma payload, comment and style',()=>{
  const doc=parseSubtitle(ass,'ass');assert.equal(renderSubtitle(doc,doc.cues),ass);
  const c=applyTiming(doc.cues,{accepted:true,transform:{scale:1,offset:-1}},10000).cues;
  assert.equal(renderSubtitle(doc,c),ass.replace('Dialogue: 2,0:00:01.23,0:00:03.45','Dialogue: 2,0:00:00.23,0:00:02.45'));
});
test('ASS custom field ordering uses declared fields',()=>{
  const doc=parseSubtitle('[Events]\nFormat: Style, End, Start, Layer, Text\nDialogue: X,0:00:04.00,0:00:01.00,3,one,two\n','ass');
  assert.equal(doc.cues[0].text,'one,two');assert.equal(doc.cues[0].start,1000);
});
test('ASS overrides do not pass through text cleanup',()=>{
  const doc=parseSubtitle(ass,'ass');const q=cleanCues(doc.cues,{format:'ass'});
  assert.equal(q.cues[0].text,doc.cues[0].text);
});
test('UTF-8, BOM and UTF-16 are decoded without replacement characters',()=>{
  assert.equal(decodeSubtitle(Buffer.concat([Buffer.from([255,254]),Buffer.from(srt(),'utf16le')])),srt());
  assert.equal(decodeSubtitle(Buffer.concat([Buffer.from([239,187,191]),Buffer.from(srt())])),srt());
  assert.throws(()=>decodeSubtitle(Buffer.from([0xc3,0x28])),/encoding/);
});
test('Malformed SRT durations and unrecognized blocks fail before export',()=>{
  assert.throws(()=>parseSubtitle('1\n00:00:03,000 --> 00:00:01,000\ntext\n'),/duration/);
  assert.throws(()=>parseSubtitle('bad subtitle'),/Invalid/);
});
test('Output timestamp rounding carries correctly',()=>{
  assert.equal(timestamp(59999.9),'00:01:00,000');assert.equal(timestamp(59999,'ass'),'0:01:00.00');
  assert.throws(()=>timestamp(-1));
});
test('Translations in arbitrary scripts preserve text during alignment',()=>{
  for(const text of ['これは翻訳です。','هذا نص مترجم','Перевод.','English translation.','हिन्दी उपशीर्षक']) {
    const doc=parseSubtitle(srt(text));const aligned=applyTiming(doc.cues,{accepted:true,transform:{scale:1.2,offset:.1}},10000);
    assert.equal(aligned.cues[0].text,text);assert.ok(Math.abs(aligned.cues[0].start-1576)<.01);
  }
});
test('Uncertain alignment and invalid transforms retain source timing',()=>{
  const doc=parseSubtitle(srt());
  assert.deepEqual(applyTiming(doc.cues,{accepted:false,transform:{scale:1,offset:100}},10000).unresolved,['cue-1']);
  const result=applyTiming(doc.cues,{accepted:true,transform:{scale:1,offset:-10}},10000);
  assert.equal(result.cues[0].start,1230);assert.equal(result.unresolved.length,1);
});
const cue=(id,start,end,text,style='')=>({id,start,end,text,style,lineage:[id]});
test('Exact continuous duplicate captions merge and retain full long interval',()=>{
  const q=cleanCues([cue('1',100,5000,'Wait.'),cue('2',5000,12000,'Wait.')]);
  assert.equal(q.cues.length,1);assert.equal(q.cues[0].end,12000);assert.deepEqual(q.cues[0].lineage,['1','2']);
});
test('Negation, speaker changes, lyrics and spaced repetitions are never fuzzy-deduplicated',()=>{
  for(const pair of [[cue('1',0,1000,'Do it.'),cue('2',1000,2000,'Do not do it.')],[cue('1',0,1000,'Yes.','A'),cue('2',1000,2000,'Yes.','B')],[cue('1',0,1000,'♪ Go'),cue('2',1000,2000,'♪ Go')],[cue('1',0,1000,'Yes.'),cue('2',2000,3000,'Yes.')]])assert.equal(cleanCues(pair).cues.length,2);
});
test('Cleanup off preserves original formatting and separate cues',()=>{
  const input=[cue('1',0,1000,'A\nline.'),cue('2',1000,2000,'A\nline.')];
  assert.deepEqual(cleanCues(input,{cleanup:false}).cues,input);
});
test('Wrapping preserves lexical content and uses at most two lines',()=>{
  const text='A long subtitle can wrap at a natural phrase boundary without changing any of its words.';
  const result=wrap(text);assert.equal(result.replace('\n',' '),text);assert.equal(result.split('\n').length,2);
});
test('Generated captions use shared timed-word grouping and observed boundaries',()=>{
  const words='This is a subtitle. Another phrase starts here.'.split(' ').map((text,i)=>({text,startsAtMs:i*700,endsAtMs:i*700+400}));
  const cues=generatedCues(words,6000);
  assert.equal(cues[0].start,0);assert.equal(cues.at(-1).end,5300);
  assert.equal(cues.map(c=>c.text).join(' '),'This is a subtitle. Another phrase starts here.');
});
test('Similarity distinguishes added negation',()=>assert.ok(similarity('I want that','I do not want that')<1));
test('Wording corrections protect names and negation even with high confidence',()=>{
  const tokens=[{confidence:.99}];
  assert.equal(safeWordingCandidate('I do not want that','I do want that',tokens),false);
  assert.equal(safeWordingCandidate('Ask Rodrigo to join us.','Ask Roberto to join us.',tokens),false);
  assert.equal(safeWordingCandidate('This is teh final subtitle.','This is the final subtitle.',tokens),true);
  assert.equal(safeWordingCandidate('This is teh final subtitle.','This is the final subtitle.',[{confidence:.6}]),false);
});
test('Recognition clipped by rough cue boundaries must never delete source words',()=>{
  assert.equal(safeWordingCandidate('¿Qué sentido tendría eso?','sentido tendría eso?',[{confidence:.99}]),false);
  assert.equal(safeWordingCandidate('Ese asunto de las cabezas me interesa.','Ese asunto de las cabezas me',[{confidence:.99}]),false);
  assert.equal(safeWordingCandidate('Hasta yo misma lo pensaba.','Hasta yo misma lo he.',[{confidence:.99}]),false);
  assert.equal(safeWordingCandidate('Capaz sí te gusta, ¿no?','Capaz si te gusta, ¿no?',[{confidence:.99}]),false);
  const source='Hasta unos meses, yo pensaba lo mismo.';
  const text='hace unos meses yo pensaba lo mismo';
  assert.equal(preserveWordingSurface(source,text),'Hace unos meses, yo pensaba lo mismo.');
  const words=text.split(' ').map((text,i)=>({text,startsAtMs:i*300,endsAtMs:i*300+250}));
  assert.equal(phraseWords({text:source,start:150,end:2000},words).length,7);
});
test('Last generated cue has a finite duration bounded by the video end',()=>{
  const source=[cue('1',1000,1900,'A final short line.')];
  const q=cleanCues(source,{generated:true,durationMs:2200});
  assert.ok(Number.isFinite(q.cues[0].end));assert.ok(q.cues[0].end<=2200);
  assert.doesNotThrow(()=>renderSubtitle({format:'srt'},q.cues));
});
test('SRT-to-ASS conversion never silently rewrites literal punctuation',()=>{
  const doc=parseSubtitle(srt('Literal {braces}'));
  assert.throws(()=>renderSubtitle(doc,doc.cues,'ass'),/preserve the wording/);
});
