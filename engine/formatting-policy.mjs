// Shared production/development policy. No model transport or evaluator dependency.
import { visibleText } from './subtitles.mjs';
import { wrapOptions, protectedText, length } from './quality.mjs';

export const flat = text => text.replace(/\n/g,' ');
const lexemes = text => text.normalize('NFC').toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu) ?? [];
const protectedSymbols = text => text.replace(/[\p{L}\p{M}\p{N}\s.,!?;:¿¡]/gu,'');
const numbers = text => text.match(/\p{N}+(?:[.,:/\-]\p{N}+)*/gu) ?? [];
export function sameWords(source, candidate) {
  return typeof candidate === 'string' && candidate.length <= 2000 &&
    !/[\p{Cc}\p{Cf}]/u.test(candidate.replace(/\n/g,'')) &&
    JSON.stringify(lexemes(source)) === JSON.stringify(lexemes(candidate)) &&
    JSON.stringify(numbers(source)) === JSON.stringify(numbers(candidate)) &&
    protectedSymbols(source) === protectedSymbols(candidate);
}
export function eligible(fixture, cue) {
  return ['auto','en','es'].includes(fixture.language) && !fixture.protected && !protectedText(cue.text,fixture.format) &&
    !/^\s*[-–—♪♫\[]/mu.test(visibleText(cue.text,fixture.format));
}
export function choices(text) {
  return wrapOptions(flat(text)).filter(value=>value.split('\n').every(line=>length(line)<=42)).slice(0,12);
}
export function applyProposal(fixture, cue, response, request) {
  const source = visibleText(cue.text,fixture.format);
  if (!eligible(fixture,cue)) return {cue,disposition:'skipped',reason:'Protected presentation or unsupported language'};
  if (!response || response.schema!==1 || response.id!==request.id || response.mode!==request.mode || response.status!=='complete') {
    return {cue,disposition:'retained',reason:response?.reason ?? 'Missing or invalid native response'};
  }
  let text;
  if (request.mode==='layout') {
    if (!Number.isInteger(response.choice) || response.choice<0 || response.choice>=request.options.length) return {cue,disposition:'rejected',reason:'Invalid break choice'};
    text=request.options[response.choice];
    if(flat(text)!==flat(source)) return {cue,disposition:'rejected',reason:'Layout changed source text'};
  } else if(request.mode==='punctuation' && fixture.punctuation) {
    text=response.text;
    if(!sameWords(source,text) || !text.trim() || /\n/.test(text)) return {cue,disposition:'rejected',reason:'Punctuation proposal changed words, numbers, protected symbols or structure'};
    if(text===flat(source)) return {cue,disposition:'unchanged',reason:'Punctuation and capitalization already match'};
  } else return {cue,disposition:'rejected',reason:'Unsupported proposal mode'};
  const updated={...cue,text:fixture.format==='ass'?text.replace(/\n/g,'\\N'):text};
  return {cue:updated,disposition:updated.text===cue.text?'unchanged':request.mode==='punctuation'?'review':'accepted',reason:request.mode==='punctuation'?'Punctuation can change meaning; human review required':'Selected an exact source-preserving line break'};
}

// Both the product and evaluator call this policy. Only the transport is injected.
export async function formatCues(input, settings, generate) {
  const cues=input.map(c=>({...c})), native=[], proposals=[];
  for(const mode of ['punctuation','layout']) {
    const entries=[];
    cues.forEach((cue,index)=>{
      if(!eligible(settings,cue)||(mode==='punctuation'&&!settings.punctuation))return;
      const source=flat(visibleText(cue.text,settings.format));
      if(source.length>2000)return;
      const options=mode==='layout'?choices(source):[];
      if(mode==='layout'&&options.length<2)return;
      entries.push({index,request:{id:cue.id,mode,language:settings.language,source,options}});
    });
    if(!entries.length)continue;
    const responses=await generate(entries.map(e=>e.request),mode);
    for(const [i,{index,request}] of entries.entries()) {
      const response=responses[i];
      const proposal=applyProposal(settings,cues[index],response,request);
      native.push(response??{id:request.id,mode,status:'error',reason:'missing_response'});
      proposals.push({id:request.id,mode,before:cues[index].text,after:proposal.cue.text,disposition:proposal.disposition,reason:proposal.reason});
      cues[index]=proposal.cue;
    }
  }
  return {cues,native,proposals};
}
