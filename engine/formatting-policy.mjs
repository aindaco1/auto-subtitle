// Shared production/development policy. No model transport or evaluator dependency.
import { visibleText } from './subtitles.mjs';
import { wrap, wrapOptions, protectedText, length } from './quality.mjs';

export const flat = text => text.replace(/\n/g,' ');
const lexemes = text => text.normalize('NFC').toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu) ?? [];
const protectedSymbols = text => text.replace(/[\p{L}\p{M}\p{N}\s.,!?;:¿¡]/gu,'');
const numbers = text => text.match(/\p{N}+(?:[.,:/\-]\p{N}+)*/gu) ?? [];
// Existing punctuation carries meaning too (questions, negation, clauses). Keep
// each mark at the same word boundary; adding missing punctuation remains reviewable.
export function preservesPunctuation(source, candidate) {
  const marks = text => {
    const result = new Map();
    let word = 0;
    for (const match of text.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*|[.,!?;:¿¡…]/gu)) {
      if (/^[\p{L}\p{M}\p{N}]/u.test(match[0])) word++;
      else result.set(word, (result.get(word) ?? '') + match[0]);
    }
    return result;
  };
  const after = marks(candidate);
  return [...marks(source)].every(([word, punctuation]) => after.get(word) === punctuation);
}
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
    if(!preservesPunctuation(source,text)) return {cue,disposition:'rejected',reason:'Existing punctuation or its word boundary changed'};
    if(text===flat(source)) return {cue,disposition:'unchanged',reason:'Punctuation and capitalization already match'};
    text=wrap(text); // Preserve normal wrapping even when only one valid layout exists.
  } else return {cue,disposition:'rejected',reason:'Unsupported proposal mode'};
  const updated={...cue,text:fixture.format==='ass'?text.replace(/\n/g,'\\N'):text};
  return {cue:updated,disposition:updated.text===cue.text?'unchanged':request.mode==='punctuation'?'review':'accepted',reason:request.mode==='punctuation'?'Punctuation can change meaning; human review required':'Selected an exact source-preserving line break'};
}

// Both the product and evaluator call this policy. Only the transport is injected.
export async function formatCues(input, settings, generate) {
  const cues=input.map(c=>({...c})), native=[], proposals=[];
  const sourceText=cue=>flat(visibleText(cue.text,settings.format));
  for(const mode of ['punctuation','layout']) {
    const entries=[];
    for(let index=0;index<cues.length;index++) {
      const cue=cues[index];
      if(!eligible(settings,cue)||(mode==='punctuation'&&!settings.punctuation))continue;
      let source=sourceText(cue);
      if(source.length>2000)continue;
      // Preserve already usable surface text. This is a conservative cleanup,
      // not a grammar rewrite; layout still gets its independent phrase check.
      if(mode==='punctuation' && /^\P{L}*\p{Lu}/u.test(source) && /[.!?…]["'”’)]*$/.test(source))continue;
      const indices=[index];
      // A subtitle boundary is not necessarily a sentence boundary. Give Apple
      // one short phrase, then project only punctuation onto the original words.
      if(mode==='punctuation') while(indices.length<3 && !/[.!?…]["'”’)]*$/.test(source)) {
        const next=cues[index+1], gap=next?next.start-cues[index].end:-1;
        if(!next || !eligible(settings,next) || next.style!==cue.style || gap<0 || gap>1000 || source.length+sourceText(next).length+1>500) break;
        source+=' '+sourceText(next);indices.push(++index);
      }
      const options=mode==='layout'?choices(source):[];
      if(mode==='layout'&&options.length<2)continue;
      entries.push({indices,request:{id:cue.id,mode,language:settings.language,source,options}});
    }
    if(!entries.length)continue;
    const responses=await generate(entries.map(e=>e.request),mode);
    for(const [i,{indices,request}] of entries.entries()) {
      const response=responses[i];
      native.push(response??{id:request.id,mode,status:'error',reason:'missing_response'});
      const parts=indices.length>1 && response?.status==='complete'?
        splitPunctuation(indices.map(index=>sourceText(cues[index])),response.text):null;
      for(const [part,index] of indices.entries()) {
        // Validate the original response identity before adapting it to each cue.
        const projected=indices.length===1?response:response?.id===request.id && response?.mode===mode?
          {...response,id:cues[index].id,text:parts?.[part]}:undefined;
        const proposal=applyProposal(settings,cues[index],projected,{...request,id:cues[index].id});
        proposals.push({id:cues[index].id,mode,before:cues[index].text,after:proposal.cue.text,disposition:proposal.disposition,reason:proposal.reason});
        cues[index]=proposal.cue;
      }
    }
  }
  return {cues,native,proposals};
}

export function splitPunctuation(sources, candidate) {
  if(!sameWords(sources.join(' '),candidate) || /\n/.test(candidate)) return null;
  const words=[...candidate.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu)];
  const result=[];
  let count=0,start=0;
  for(const [index,source] of sources.entries()) {
    count+=lexemes(source).length;
    let end=candidate.length;
    if(index<sources.length-1) {
      if(!words[count] || !words[count-1]) return null;
      const previousEnd=words[count-1].index+words[count-1][0].length;
      const between=candidate.slice(previousEnd,words[count].index);
      const separator=/\s+(?:[¿¡“"']*)$/.exec(between);
      if(!separator) return null;
      end=previousEnd+separator.index;
    }
    const part=candidate.slice(start,end).trim();
    if(!sameWords(source,part) || !preservesPunctuation(source,part)) return null;
    result.push(part);start=end;
  }
  return result;
}
