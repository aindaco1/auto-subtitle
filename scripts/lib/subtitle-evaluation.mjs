import { createHash } from 'node:crypto';
import { fixtures, calibration } from '../../tests/fixtures/formatting.mjs';
import { parseSubtitle, renderSubtitle, visibleText } from '../../engine/subtitles.mjs';
import { cleanCues } from '../../engine/quality.mjs';
import { createJevRequest } from '../../shared/dust-wave-platform/packages/test-core/src/jev.js';

export { fixtures, calibration };
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const fixtureHash = digest(fixtures);
export const calibrationHash = digest(calibration);
export const displayText = text => 'Subtitle display. Each numbered LINE is a separate visible line; line boundaries matter.\n' + text.split('\n\n').map((cue,i)=>`CAPTION ${i+1}:\n`+cue.split('\n').map((line,j)=>`LINE ${j+1}: ${line}`).join('\n')).join('\n\n');
export const protocolHash = digest(createJevRequest.toString()+displayText.toString());
export { flat, sameWords, eligible, choices, applyProposal } from '../../engine/formatting-policy.mjs';
import { flat, sameWords, eligible } from '../../engine/formatting-policy.mjs';
export function baseline(fixture) {
  const document = parseSubtitle(fixture.source,fixture.format);
  const quality = cleanCues(document.cues,{format:fixture.format,language:fixture.language});
  return {document,...quality};
}
export function evaluateOutput(fixture,cues) {
  const base=baseline(fixture), failures=[];
  if(cues.length!==base.cues.length) failures.push('Unexpected cue count');
  if(fixture.expectedCues!==undefined&&cues.length!==fixture.expectedCues) failures.push('Duplicate consolidation failed');
  for(let i=0;i<cues.length;i++) {
    const c=cues[i], original=base.cues[i];
    if(!original) continue;
    if(c.start!==original.start||c.end!==original.end||c.style!==original.style) failures.push('Timing or presentation changed');
    const source=visibleText(original.text,fixture.format), text=visibleText(c.text,fixture.format);
    if(!(fixture.punctuation?sameWords(source,text):flat(source)===flat(text))) failures.push('Words or protected punctuation changed');
    if(!eligible(fixture,original)&&c.text!==original.text) failures.push('Protected source changed');
  }
  const quality=cleanCues(cues,{format:fixture.format,language:fixture.language,cleanup:false});
  if(fixture.expectedWarning&&!quality.warnings.some(w=>w.issues.some(i=>i.startsWith(fixture.expectedWarning)))) failures.push('Missing readability warning');
  try {
    const rendered=renderSubtitle(base.document,cues);
    const parsed=parseSubtitle(rendered,fixture.format);
    if(parsed.cues.length!==cues.length||parsed.cues.some((c,i)=>c.text!==cues[i].text||c.start!==cues[i].start||c.end!==cues[i].end)) failures.push('Export round trip changed text/timing');
  } catch {failures.push('Invalid exported subtitle');}
  return {failures:[...new Set(failures)],warnings:quality.warnings};
}
export function prepareJev(report) {
  // Validate the entire corpus before credentials or network use. Even saved candidate
  // text must consist only of its public source words, not arbitrary uploaded content.
  if(report.schema!=='auto-subtitle.formatting.v1'||report.fixtureHash!==fixtureHash||report.cases?.length!==fixtures.length) throw Error('Only the complete built-in public corpus can be evaluated remotely');
  return fixtures.map((fixture,i)=>{
    const saved=report.cases[i];
    if(saved.id!==fixture.id||saved.sourceHash!==digest(fixture.source)||!Array.isArray(saved.cues)||saved.outputHash!==digest(saved.cues)) throw Error('Saved public evidence changed');
    const check=evaluateOutput(fixture,saved.cues);
    if(check.failures.length) throw Error('Public candidate failed deterministic validation; nothing was sent');
    return {id:fixture.id,candidate:displayText(saved.cues.map(c=>visibleText(c.text,fixture.format)).join('\n\n')),
      reference:displayText(parseSubtitle(fixture.source,fixture.format).cues.map(c=>visibleText(c.text,fixture.format)).join('\n\n')),requirements:fixture.requirements};
  });
}
export function summarize(report,jev) {
  const deterministic=report.cases.every(c=>c.failures.length===0);
  const native=report.provider==='deterministic'?'not-requested':
    (report.cases.some(c=>c.native.length>0)&&report.cases.every(c=>c.native.every(r=>r.status==='complete')&&c.proposals.every(p=>!['rejected','retained'].includes(p.disposition))))?'complete':'incomplete';
  const findings=jev?.cases.flatMap(c=>Object.values(c.result?.findings??{}))??[];
  return {deterministic,native,semantic:!jev?'not-run':!jev.complete?'incomplete':findings.some(f=>f.decision==='fail')?'fail':findings.some(f=>f.decision==='review')?'review':'pass',
    passed:deterministic&&native!=='incomplete'&&!!jev?.complete&&findings.length>0&&findings.every(f=>f.decision==='pass'),releaseAccepted:false};
}
