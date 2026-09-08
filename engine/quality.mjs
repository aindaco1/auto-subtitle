import { visibleText } from './subtitles.mjs';
import { groupTimedWords, DEFAULT_TIMED_WORD_GROUPING_POLICY } from '../shared/dust-wave-platform/packages/timed-text/src/word-grouping.js';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export const length = text => [...segmenter.segment(text)].length;
const protectedText = (text, format) => format === 'ass' ? /\{[^}]*\}|\\[nh]/.test(text) : /<[^>]*>/.test(text);
export function wrap(text, limit = 42) {
  // Keep speaker turns, lyrics, markup and unspaced scripts intact. Report instead of guessing.
  if (/^\s*[-–—♪♫]/mu.test(text) || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(text)) return text;
  const flat = text.replace(/\n/g, ' ');
  if (length(flat) <= limit) return flat;
  const spaces = [...flat.matchAll(/ /g)].map(m => m.index);
  let best, score = Infinity;
  for (const i of spaces) {
    const left = flat.slice(0, i), right = flat.slice(i + 1);
    const longest = Math.max(length(left), length(right));
    let cost = Math.max(0, longest - limit) * 100 + Math.abs(length(left) - length(right));
    if (/[,;:.!?]$/.test(left)) cost -= 16;
    if (/\b(the|a|an|de|del|el|la|los|las|un|una|y|and|to|of)$/iu.test(left)) cost += 35;
    if (cost < score) { best = i; score = cost; }
  }
  return best === undefined ? text : flat.slice(0, best) + '\n' + flat.slice(best + 1);
}

export function generatedCues(words, durationMs) {
  if (!words.length) throw new Error('No speech was recognized. Choose another audio track or check the audio language.');
  return groupTimedWords(words, { durationMs, policy: { ...DEFAULT_TIMED_WORD_GROUPING_POLICY, targetCharactersPerCue: 64, maximumCharactersPerCue: 84, maximumCueDurationMs: 6500 } })
    .map((c,i) => ({ id: `generated-${i+1}`, start:c.startsAtMs, end:c.endsAtMs, text:c.textMarkdown, style:'', lineage:[`generated-${i+1}`] }));
}

export function cleanCues(input, { format='srt', language='auto', cleanup=true, generated=false, durationMs=Infinity, fps=0 }={}) {
  const cues = [], changes = [], warnings = [];
  for (const original of input) {
    const c = { ...original, lineage:[...(original.lineage ?? [original.id])] };
    const prev = cues.at(-1);
    const continuous = prev && c.start <= prev.end + 100 && c.start >= prev.start;
    const plain = !protectedText(c.text,format) && !/^\s*[-–—♪♫\[]/mu.test(c.text);
    if (cleanup && continuous && plain && c.text === prev.text && c.style === prev.style) {
      prev.end = Math.max(prev.end,c.end); prev.lineage.push(...c.lineage); prev.continuous = true;
      changes.push({type:'merge',ids:prev.lineage,reason:'Identical continuous caption; full interval retained'}); continue;
    }
    if (cleanup && !protectedText(c.text,format)) {
      const before = c.text;
      c.text = wrap(format==='ass' ? c.text.replace(/\\N/g,'\n') : c.text);
      if (format==='ass') c.text=c.text.replace(/\n/g,'\\N');
      if (before!==c.text) changes.push({type:'wrap',id:c.id});
    }
    cues.push(c);
  }
  const cps = language === 'en' ? 20 : 17, gap = fps>0 ? 2000/fps : 80;
  for (let i=0;i<cues.length;i++) {
    const c=cues[i], text=visibleText(c.text,format), count=length(text.replace(/\n/g,''));
    if (generated) {
      const ideal=Math.max(833, count/cps*1000);
      const nextBoundary=(cues[i+1]?.start ?? durationMs+gap)-gap;
      c.end=Math.min(nextBoundary, durationMs, Math.max(c.end,Math.min(c.end+500,c.start+ideal)));
      c.end=Math.max(c.start+1,c.end);
    }
    const issues=[];
    if (text.split('\n').length>2 || text.split('\n').some(l=>length(l)>42)) issues.push('Long caption: no reliable word boundary available for further subdivision');
    if (count/(c.end-c.start)*1000>cps) issues.push(`Reading speed exceeds ${cps} characters/second`);
    if (c.end-c.start<833) issues.push('Short display duration');
    if (c.end-c.start>7000 && !c.continuous) issues.push('Long display duration');
    if (c.start<0||c.end>durationMs) issues.push('Outside video timeline');
    if (issues.length) warnings.push({id:c.id,issues});
  }
  return {cues,changes,warnings};
}
