#!/usr/bin/env node
// Developer tooling only; scripts/, fixtures and test-core are not app resources.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { evaluateJevCases, callCloudflareJev, judgeJevResponse } from '../shared/dust-wave-platform/packages/test-core/src/jev.js';
import { fixtures, calibration, fixtureHash, calibrationHash, protocolHash, digest, baseline, eligible, choices, flat, displayText,
  applyProposal, evaluateOutput, prepareJev, summarize } from './lib/subtitle-evaluation.mjs';
import { renderSubtitle, visibleText } from '../engine/subtitles.mjs';
import { formatCues } from '../engine/formatting-policy.mjs';

const execute=promisify(execFile);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {values:args}=parseArgs({options:{apple:{type:'boolean'},live:{type:'boolean'},calibrate:{type:'boolean'},'wrangler-auth':{type:'boolean'},
  evidence:{type:'string'},policy:{type:'string'},output:{type:'string'},'max-questions':{type:'string',default:'100'},help:{type:'boolean'}}});
if(args.help) {
  console.log('Usage: node scripts/check-formatting.mjs [--apple] [--live] [--policy FILE] [--wrangler-auth] [--output DIR]\n       node scripts/check-formatting.mjs --calibrate [--live]\n       node scripts/check-formatting.mjs --evidence report.json [--live] [--policy FILE]\nDefault: deterministic corpus and offline Jev request preview. Only built-in public synthetic text can be sent.');
  process.exit(0);
}
if(args.apple&&(args.evidence||args.calibrate)) throw Error('--apple cannot be combined with --evidence or --calibrate');
const questionBudget=Number(args['max-questions']);
if(!Number.isSafeInteger(questionBudget)||questionBudget<1||questionBudget>100) throw Error('Question budget must be between 1 and 100');
const output=path.resolve(args.output??path.join(root,'artifacts/evaluation',new Date().toISOString().replace(/[:.]/g,'-')));
await mkdir(path.dirname(output),{recursive:true});
await mkdir(output); // Never overwrite an earlier evaluation.
const save=async(name,value)=>writeFile(path.join(output,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{mode:0o600});

async function credentials() {
  const accountId=process.env.CLOUDFLARE_ACCOUNT_ID;
  let token=process.env.CLOUDFLARE_API_TOKEN;
  if(!/^[a-fA-F0-9]{32}$/.test(accountId??'')) throw Error('Set CLOUDFLARE_ACCOUNT_ID locally before live evaluation');
  if(args['wrangler-auth']) {
    try {
      const {stdout}=await execute('npx',['--no-install','wrangler@4.136.2','auth','token','--json'],{timeout:45_000,maxBuffer:128_000});
      const value=JSON.parse(stdout); token=value.token??value.access_token;
    } catch {throw Error('Existing Wrangler authentication unavailable; no credential output shown');}
  }
  if(typeof token!=='string'||!token.trim()) throw Error('Set CLOUDFLARE_API_TOKEN or use --wrangler-auth');
  return {accountId,token};
}

async function judge(cases,policy) {
  // This preflight validates every request and the whole budget before auth.
  const preview=await evaluateJevCases(cases,{policy,maxQuestions:questionBudget});
  await save('jev-preview.json',preview);
  if(!args.live) return preview;
  const auth=await credentials();
  return evaluateJevCases(cases,{policy,maxQuestions:questionBudget,call:request=>callCloudflareJev(request,auth),onProgress:report=>save('jev.json',report)});
}

async function nativeProbe() {
  if(process.platform!=='darwin') throw Error('Apple prototype requires an Apple Intelligence-ready Mac with macOS 26 or later');
  const source=path.join(root,'formatting-sidecar/AppleSubtitleFormatter.swift');
  const contents=await readFile(source,'utf8');
  const {stdout:toolchain}=await execute('xcrun',['swiftc','--version']);
  const shared=await readFile(path.join(root,'shared/dust-wave-platform/native/Sources/DustWaveAppleIntelligence/AppleGeneration.swift'),'utf8');
  const directory=path.join(os.homedir(),'Library/Caches/AutoSubtitlePrototype',digest(contents+shared+toolchain));
  await mkdir(directory,{recursive:true});
  const buildArgs=['build','--package-path',path.join(root,'formatting-sidecar'),'--scratch-path',directory];
  await execute('swift',[...buildArgs,'--product','auto-subtitle-format'],{timeout:300_000,maxBuffer:2_000_000});
  const {stdout:binPath}=await execute('swift',[...buildArgs,'--show-bin-path']);
  const binary=path.join(binPath.trim(),'auto-subtitle-format');
  await execute('/usr/bin/codesign',['--force','--sign','-',binary],{timeout:10_000});
  await save('AppleSubtitleFormatter.swift',contents);
  await save('AppleGeneration.swift',shared);
  const {stdout:macOS}=await execute('/usr/bin/sw_vers',[]);
  await save('native-environment.json',{toolchain,macOS,architecture:os.arch(),sourceHash:digest(contents),sharedSourceHash:digest(shared),binaryHash:digest(await readFile(binary))});
  return async (requests,mode)=>{
    if(!requests.length) return [];
    const input=path.join(output,`${mode}-requests.json`);
    await save(`${mode}-requests.json`,requests);
    try {
      const {stdout,stderr}=await execute(binary,[input],{timeout:60_000,maxBuffer:2_000_000});
      await save(`${mode}-responses.ndjson`,stdout);
      if(stderr) await save(`${mode}-stderr.txt`,stderr);
      const rows=stdout.trim().split('\n').map(line=>JSON.parse(line));
      if(rows.length!==requests.length||rows.some((r,i)=>r.id!==requests[i].id||r.mode!==requests[i].mode)) throw Error('Incomplete or mismatched native batch');
      return rows;
    } catch(error) {
      if(error.stdout) await save(`${mode}-partial.ndjson`,String(error.stdout));
      const reason=error.killed?'Native batch exceeded 60 seconds':'Native batch failed or returned an invalid response';
      return requests.map(r=>({schema:1,id:r.id,mode:r.mode,status:'error',reason}));
    }
  };
}

async function corpus() {
  if(args.evidence) return JSON.parse(await readFile(path.resolve(args.evidence),'utf8'));
  const report={schema:'auto-subtitle.formatting.v1',fixtureHash,provider:args.apple?'apple-prototype':'deterministic',startedAt:new Date().toISOString(),releaseAccepted:false,cases:[]};
  for(const fixture of fixtures) {
    const base=baseline(fixture);
    report.cases.push({id:fixture.id,sourceHash:digest(fixture.source),cues:base.cues,changes:base.changes,native:[],proposals:[]});
    await save(`${fixture.id}.source.${fixture.format}`,fixture.source);
  }
  if(args.apple) {
    const probe=await nativeProbe();
    for(const [i,fixture] of fixtures.entries()) {
      const row=report.cases[i];
      const formatted=await formatCues(row.cues,fixture,(requests,mode)=>probe(requests,`${fixture.id}-${mode}`));
      Object.assign(row,formatted);
    }
  }
  for(const [i,fixture] of fixtures.entries()) {
    const row=report.cases[i];
    Object.assign(row,evaluateOutput(fixture,row.cues),{outputHash:digest(row.cues)});
    await save(`${fixture.id}.candidate.${fixture.format}`,renderSubtitle(baseline(fixture).document,row.cues));
  }
  await save('report.json',report);
  return report;
}

function reviewMarkdown(report,jev,summary) {
  const lines=['# Subtitle formatting evaluation','',`Provider: ${report.provider}. Source preservation: ${summary.deterministic?'pass':'fail'}. Literal formatting: ${summary.formatting?'pass':'fail'}. Native calls: ${summary.native}. Jev: ${summary.semantic}.`,'',
    'Development evidence only. Punctuation/capitalization proposals require human review. Audio-supported wording corrections remain in the existing Improve pipeline; this text-only probe cannot verify audio.',''];
  for(const [i,fixture] of fixtures.entries()) {
    const row=report.cases[i], evaluation=jev.cases.find(c=>c.id===fixture.id);
    lines.push(`## ${fixture.id}`,'','Source:','```',fixture.source.trim(),'```','','Candidate:','```',renderSubtitle(baseline(fixture).document,row.cues).trim(),'```','');
    for(const item of row.proposals) lines.push(`- ${item.mode}: ${item.disposition}. ${item.reason}`);
    for(const failure of row.failures) lines.push(`- Deterministic failure: ${failure}`);
    for(const failure of row.formattingFailures??[]) lines.push(`- Literal formatting failure: ${failure}`);
    for(const response of row.native.filter(r=>r.recovery)) lines.push(`- Source-derived recovery: ${response.recovery.accepted?'selected a bounded option':'failed; original retained'}. Draft retained in native evidence.`);
    for(const warning of row.warnings) lines.push(`- ${warning.id}: ${warning.issues.join('; ')}`);
    for(const [key,finding] of Object.entries(evaluation?.result?.findings??{})) lines.push(`- Jev ${key}: ${finding.decision} (margin ${finding.margin.toFixed(3)})`);
    lines.push('');
  }
  return lines.join('\n');
}

try {
  await save('implementation.json',{files:Object.fromEntries(await Promise.all(['scripts/check-formatting.mjs','scripts/lib/subtitle-evaluation.mjs','engine/quality.mjs','engine/formatting-policy.mjs','tests/fixtures/formatting.mjs'].map(async name=>[name,digest(await readFile(path.join(root,name)))]))),
    sharedPin:(await execute('git',['-C',path.join(root,'shared/dust-wave-platform'),'rev-parse','HEAD'])).stdout.trim()});
  if(args.calibrate) {
    const policy={minimumMargin:0.10,models:[]}; // Predeclared, never fitted to formatter outputs.
    const judged=await judge(calibration.map(c=>({...c,candidate:displayText(c.candidate),reference:displayText(c.reference)})),policy);
    const models=[...new Set(judged.cases.flatMap(row=>row.result?[row.result.model]:[]))];
    const proposed={...policy,models,fixtureHash,calibrationHash,protocolHash};
    const rows=judged.cases.filter(row=>row.raw).map(row=>{
      const decision=judgeJevResponse(row.raw,row.request.input.questions,proposed).findings.check.decision;
      const fixture=calibration.find(c=>c.id===row.id);
      return {id:row.id,split:fixture.split,expected:fixture.expected,decision};
    });
    const accepted=judged.complete&&rows.length===calibration.length&&rows.every(row=>row.decision===row.expected);
    await save('calibration.json',{complete:judged.complete,accepted,policy:proposed,rows,releaseAccepted:false});
    if(accepted) await save('policy.json',proposed);
    console.log(`${args.live?'Live calibration':'Calibration preview'}: ${output}; ${rows.filter(r=>r.decision===r.expected).length}/${calibration.length} confident correct decisions.`);
    if(args.live&&!accepted) process.exitCode=1;
  } else {
    const report=await corpus();
    const cases=prepareJev(report);
    let policy={minimumMargin:0.10,models:[]};
    {
      policy=JSON.parse(await readFile(args.policy?path.resolve(args.policy):path.join(root,'tests/fixtures/jev-policy.json'),'utf8'));
      if(policy.fixtureHash!==fixtureHash||policy.calibrationHash!==calibrationHash||policy.protocolHash!==protocolHash) throw Error('Stale Jev policy; rerun calibration before evaluation');
    }
    const jev=await judge(cases,policy), summary=summarize(report,jev);
    await save('evaluated-report.json',report);
    await save('summary.json',summary);
    await save('review.md',reviewMarkdown(report,jev,summary));
    console.log(`${report.provider}: ${output}\nSource preservation: ${summary.deterministic}; literal formatting: ${summary.formatting}; native: ${summary.native}; Jev: ${summary.semantic}; release accepted: false`);
    if(!summary.deterministic||(report.provider!=='deterministic'&&!summary.formatting)||summary.native==='incomplete'||(args.live&&!summary.passed)) process.exitCode=1;
  }
} catch(error) {
  await save('error.json',{complete:false,message:error.message,releaseAccepted:false});
  console.error(error.message);process.exitCode=2;
}
