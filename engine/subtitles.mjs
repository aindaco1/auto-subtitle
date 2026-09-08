import { readFile } from 'node:fs/promises';

export function decodeSubtitle(buffer) {
  if (buffer.length > 32 * 1024 * 1024) throw new Error('Subtitle files must be smaller than 32 MB.');
  let encoding = 'utf-8';
  if (buffer[0] === 0xff && buffer[1] === 0xfe) encoding = 'utf-16le';
  if (buffer[0] === 0xfe && buffer[1] === 0xff) encoding = 'utf-16be';
  try { return new TextDecoder(encoding, { fatal: true }).decode(buffer); }
  catch { throw new Error('This subtitle uses an unknown text encoding. Save it as UTF-8 or UTF-16 and try again.'); }
}
export const readSubtitle = async (file) => parseSubtitle(decodeSubtitle(await readFile(file)), file.split('.').at(-1));

export function parseTime(value) {
  const match = /^(\d+):([0-5]\d):([0-5]\d)[,.](\d{2,3})$/.exec(value.trim());
  if (!match) throw new Error(`Invalid subtitle time: ${value}`);
  return (+match[1] * 3600 + +match[2] * 60 + +match[3]) * 1000 + +match[4].padEnd(3, '0');
}
export function timestamp(ms, format = 'srt') {
  if (!Number.isFinite(ms) || ms < 0) throw new Error('Subtitle time is outside the video.');
  const quantum = format === 'ass' ? 10 : 1;
  const t = Math.round(ms / quantum) * quantum;
  const h = Math.floor(t / 3600000), m = Math.floor(t / 60000) % 60, s = Math.floor(t / 1000) % 60;
  return `${String(h).padStart(format === 'ass' ? 1 : 2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${format === 'ass' ? '.' : ','}${String(t % 1000 / quantum).padStart(format === 'ass' ? 2 : 3, '0')}`;
}
export function parseSubtitle(source, format = 'srt') {
  format = format.toLowerCase();
  if (!['srt', 'ass'].includes(format)) throw new Error('Choose an SRT or ASS subtitle.');
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const doc = { format, lines, newline, cues: [] };
  if (format === 'srt') {
    let i = 0;
    while (i < lines.length) {
      if (!lines[i].trim()) { i++; continue; }
      const blockStart = i;
      if (!/^\d+$/.test(lines[i].trim())) throw new Error(`Invalid SRT cue at line ${i + 1}.`);
      i++;
      const timeLine = i;
      const match = /^(\s*)(\d+:\d{2}:\d{2}[,.]\d{3})(\s+-->\s+)(\d+:\d{2}:\d{2}[,.]\d{3})(.*)$/.exec(lines[i++] ?? '');
      if (!match) throw new Error(`Invalid SRT timing at line ${i}.`);
      const payloadStart = i;
      while (i < lines.length && lines[i].trim()) i++;
      doc.cues.push({ id: `cue-${doc.cues.length + 1}`, start: parseTime(match[2]), end: parseTime(match[4]), text: lines.slice(payloadStart, i).join('\n'), blockStart, timeLine, payloadStart, payloadEnd: i, timeParts: match, style: '' });
    }
  } else {
    let section = '', fields;
    for (let i = 0; i < lines.length; i++) {
      if (/^\[.*\]$/.test(lines[i].trim())) { section = lines[i].trim().toLowerCase(); continue; }
      if (section !== '[events]') continue;
      const header = /^Format:\s*(.*)$/i.exec(lines[i]);
      if (header) { fields = header[1].split(',').map(v => v.trim().toLowerCase()); continue; }
      const event = /^(Dialogue:\s*)(.*)$/i.exec(lines[i]);
      if (!event) continue;
      if (!fields || fields.at(-1) !== 'text' || !fields.includes('start') || !fields.includes('end')) throw new Error('ASS events need Start, End and a final Text field.');
      const values = event[2].split(',');
      if (values.length < fields.length) throw new Error(`Invalid ASS event at line ${i + 1}.`);
      values.splice(fields.length - 1, values.length, values.slice(fields.length - 1).join(','));
      const field = name => values[fields.indexOf(name)] ?? '';
      doc.cues.push({ id: `cue-${doc.cues.length + 1}`, start: parseTime(field('start')), end: parseTime(field('end')), text: field('text'), style: fields.filter(f => !['start','end','text'].includes(f)).map(field).join(','), line: i, values, fields: [...fields], prefix: event[1] });
    }
  }
  if (!doc.cues.length) throw new Error('The subtitle contains no dialogue cues.');
  if (doc.cues.length > 100000) throw new Error('The subtitle has too many cues.');
  for (const cue of doc.cues) {
    if (cue.end <= cue.start || !cue.text.trim()) throw new Error(`Cue ${cue.id} has an empty text or invalid duration.`);
    cue.lineage = [cue.id];
  }
  return doc;
}

export function visibleText(text, format) {
  return (format === 'ass' ? text.replace(/\{[^}]*\}/g, '').replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' ') : text.replace(/<[^>]*>/g, ''));
}

export function renderSubtitle(doc, cues, format = doc.format) {
  for (const c of cues) if (!Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < 0 || Math.round(c.end / (format === 'ass' ? 10 : 1)) <= Math.round(c.start / (format === 'ass' ? 10 : 1))) throw new Error('Export contains an invalid or unrepresentable cue duration.');
  if (format === 'ass' && doc.format === 'ass') {
    const replacements = new Map();
    for(const c of cues){const items=replacements.get(c.line)??[];items.push(c);replacements.set(c.line,items);}
    const old = new Set(doc.cues.map(c => c.line));
    return doc.lines.flatMap((line, i) => {
      if (!old.has(i)) return [line];
      const events = replacements.get(i) ?? [];
      return events.map(c=>{
      const values = [...c.values];
      values[c.fields.indexOf('start')] = timestamp(c.start, 'ass');
      values[c.fields.indexOf('end')] = timestamp(c.end, 'ass');
      values[c.fields.indexOf('text')] = c.text;
      return c.prefix + values.join(',');
      });
    }).join(doc.newline);
  }
  if (format === 'srt') {
    return cues.map((c,i) => `${i + 1}\n${timestamp(c.start)} --> ${timestamp(c.end)}${doc.format === 'srt' ? c.timeParts?.[5] ?? '' : ''}\n${doc.format === 'ass' ? visibleText(c.text, 'ass') : c.text}\n`).join('\n').replace(/\n/g, doc.newline ?? '\n');
  }
  if(cues.some(c=>/[{}]|\\[Nnh]/.test(visibleText(c.text,'srt')))) throw new Error('ASS cannot safely represent these literal braces or backslash escapes. Export SRT to preserve the wording.');
  const header = '[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,60,60,45,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  return header + cues.map(c => `Dialogue: 0,${timestamp(c.start,'ass')},${timestamp(c.end,'ass')},Default,,0,0,0,,${visibleText(c.text,'srt').replace(/\n/g,'\\N')}`).join('\n') + '\n';
}
