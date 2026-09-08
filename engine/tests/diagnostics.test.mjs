import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { projectState,validateAutoSubtitleReport,crashFacts,crashApplication,autoSubtitleFingerprint } from '../diagnostics-contract.mjs';
import { sendDiagnostic } from '../diagnostics.mjs';
const id='12345678-1234-4234-8234-123456789abc';
test('State export only retains allowlisted facts; text, paths, tokens and media hashes cannot leak',()=>{
  const secret='PRIVATE_FAKE_SECRET';
  const r=projectState({application:{version:secret,build:'1',operatingSystem:'26.0',hostname:secret},state:{mode:'align',phase:'timing',status:'running',format:'srt',video:'/Users/person/Private/movie.mkv',videoType:secret,subtitleText:secret,modelInstalled:true,error:secret,token:secret,sourceHash:secret},environment:{PASSWORD:secret}},id);
  assert.ok(!JSON.stringify(r).includes(secret));assert.ok(!JSON.stringify(r).includes('/Users/'));validateAutoSubtitleReport(r);
});
test('Relay rejects arbitrary fields at every contract boundary',()=>{
  for(const mutate of [r=>r.path='/secret',r=>r.application.username='secret',r=>r.state.transcript='secret',r=>r.state.phase='arbitrary']) {
    const r=projectState({},id);mutate(r);assert.throws(()=>validateAutoSubtitleReport(r));
  }
});
test('Numeric release build numbers are preserved without accepting arbitrary application text',()=>{
  assert.equal(projectState({application:{version:'1.0.0',build:'10000'}},id).application.build,'10000');
  assert.equal(projectState({application:{build:'private-build-name'}},id).application.build,'0');
});
test('Native crash projection ignores paths, descriptions, identifiers and arbitrary stack symbols',()=>{
  const c=crashFacts({bundleID:'com.dustwave.autosubtitle'}, {procName:'AutoSubtitle',exception:{type:'EXC_BAD_ACCESS',signal:'SIGSEGV',message:'SECRET'},faultingThread:0,threads:[{frames:[{imageIndex:0,imageOffset:12,symbol:'SECRET'}]}],usedImages:[{name:'AutoSubtitle',path:'/Users/SECRET/app',uuid:'SECRET'}],userID:'SECRET'});
  assert.deepEqual(c,{exception:'EXC_BAD_ACCESS',signal:'SIGSEGV',image:'AutoSubtitle',imageOffset:12});
  assert.throws(()=>crashFacts({bundleID:'another.app'},{procName:'AutoSubtitle'}));
});
test('Imported crashes retain the incident version rather than the current app version',()=>{
  assert.deepEqual(crashApplication({app_version:'0.3.1',build_version:'2'},{osVersion:{train:'macOS 26.6.2 (25G99)'}},id),
    {version:'0.3.1',build:'2',operatingSystem:'26.6.2',architecture:'arm64'});
  assert.equal(crashApplication({app_version:'PRIVATE'}, {osVersion:{train:'PRIVATE'}},id).version,'0');
});
test('The same native crash groups together regardless of the current workflow',async()=>{
  const a=projectState({},id);a.kind='native_crash';a.crash={exception:'EXC_BAD_ACCESS',image:'AutoSubtitle',imageOffset:12};
  const b=structuredClone(a);b.state.mode='generate';b.state.phase='speech';b.state.format='ass';
  assert.equal(await autoSubtitleFingerprint(a),await autoSubtitleFingerprint(b));
  b.application.build='10001';assert.notEqual(await autoSubtitleFingerprint(a),await autoSubtitleFingerprint(b));
});
test('Equivalent reports fingerprint identically regardless of object key order or report ID',async()=>{
  const a=projectState({},id,'workflow_failure');
  const reorder=value=>value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reorder(v)])):value;
  const b=reorder(a);b.id='22345678-1234-4234-8234-123456789abc';
  assert.equal(await autoSubtitleFingerprint(a),await autoSubtitleFingerprint(b));
});
test('Reviewed current state and failures can send; receipt is bounded, correlated and repo-fixed',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'auto-subtitle-report-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'report.json');await writeFile(file,JSON.stringify(projectState({},id)));
  const stateReceipt=await sendDiagnostic(file,{fetcher:async(url,options)=>{
    assert.equal(JSON.parse(options.body).kind,'current_state');
    return new Response(JSON.stringify({ok:true,reportId:id,action:'created',issueNumber:8}));
  }});
  assert.equal(stateReceipt.issueURL,'https://github.com/aindaco1/auto-subtitle/issues/8');
  await writeFile(file,JSON.stringify(projectState({},id,'workflow_failure')));
  const receipt=await sendDiagnostic(file,{fetcher:async(url,options)=>{
    assert.equal(url,'https://crash.dustwave.xyz/v1/auto-subtitle/reports');assert.equal(options.redirect,'error');
    return new Response(JSON.stringify({ok:true,reportId:id,action:'updated',issueNumber:9}));
  }});
  assert.equal(receipt.issueURL,'https://github.com/aindaco1/auto-subtitle/issues/9');
  const duplicate=await sendDiagnostic(file,{fetcher:async()=>new Response(JSON.stringify({ok:true,reportId:id,action:'duplicate',issueNumber:9}))});
  assert.match(duplicate.summary,/not counted again/);
  await assert.rejects(sendDiagnostic(file,{fetcher:async()=>new Response(JSON.stringify({ok:true,reportId:'wrong',action:'created',issueNumber:3}))}),/receipt/);
});
test('Current-state grouping distinguishes processing state without personal identifiers',async()=>{
  const idle=projectState({},id),running=projectState({state:{status:'running',phase:'speech'}},id);
  assert.notEqual(await autoSubtitleFingerprint(idle),await autoSubtitleFingerprint(running));
  assert.notEqual(await autoSubtitleFingerprint(idle),await autoSubtitleFingerprint(projectState({},id,'workflow_failure')));
});
