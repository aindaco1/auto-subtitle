import test from 'node:test';
import assert from 'node:assert/strict';
import { validResult, strongTokens, safeWordingCandidate } from '../recognition.mjs';

const word={text:'hello',startsAtSeconds:0,endsAtSeconds:1};
const result=()=>({words:[{...word}],tokens:[{...word,confidence:.99}]});
test('recognition evidence validates words AND tokens before fresh or cached results are accepted',()=>{
  assert.equal(validResult(result(),1000),true);
  assert.equal(validResult({words:[],tokens:[]},1000),true,'Silent audio may contain no speech');
  for(const value of [null,{}, {words:[null],tokens:[]}]) assert.equal(validResult(value,1000),false);
  for(const field of ['words','tokens']) {
    for(const change of [{text:7},{startsAtSeconds:NaN},{endsAtSeconds:Infinity},{startsAtSeconds:-1},{endsAtSeconds:5},{startsAtSeconds:1,endsAtSeconds:0}]) {
      const value=result();Object.assign(value[field][0],change);
      assert.equal(validResult(value,1000),false,JSON.stringify(change));
    }
    const value=result();value[field].push({...value[field][0],startsAtSeconds:0});value[field][0].startsAtSeconds=.2;
    assert.equal(validResult(value,1000),false,'Out-of-order evidence must not silently lose words');
  }
  const zero=result();zero.tokens[0].endsAtSeconds=0;
  assert.equal(validResult(zero,1000),true,'Zero-duration subword anchors are valid');
  for(const confidence of [null,undefined,NaN,Infinity,-.1,1.1,'0.99']) {
    const value=result();value.tokens[0].confidence=confidence;
    assert.equal(validResult(value,1000),false);
    assert.equal(strongTokens(value.tokens),false);
    assert.equal(safeWordingCandidate('Please turn that ligth off','Please turn that light off',value.tokens),false);
  }
});
test('both recognition passes need strong evidence for corrections and recovered dialogue',()=>{
  assert.equal(strongTokens([]),false);
  assert.equal(strongTokens([{confidence:.99},{confidence:.1}]),false);
  assert.equal(strongTokens([{confidence:.94}],.95),false);
  assert.equal(strongTokens([{confidence:.99}],.95),true);
});
