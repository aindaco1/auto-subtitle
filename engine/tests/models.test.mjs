import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm, symlink, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyModel, installModel, discoverCandidates } from '../models.mjs';
const bytes=Buffer.from('verified test weights');
const inventory={repository:'example/model',revision:'abc123',bytes:bytes.length,files:[{path:'Encoder/weights.bin',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]};
async function setup(t) {
  const root=await mkdtemp(path.join(os.tmpdir(),'auto-subtitle-model-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=path.join(root,'source');await mkdir(path.join(source,'Encoder'),{recursive:true});await writeFile(path.join(source,inventory.files[0].path),bytes);
  return {root,source,destination:path.join(root,'installed')};
}
test('Compatible local model installs without any network access',async t=>{
  const f=await setup(t);const output=await installModel(f.source,{destination:f.destination,inventory,fetcher:()=>{throw new Error('Unexpected network');}});
  assert.equal(output,f.destination);assert.deepEqual(await readFile(path.join(output,inventory.files[0].path)),bytes);
});
test('Tampered model and source symlink escape are rejected',async t=>{
  const f=await setup(t);await writeFile(path.join(f.source,inventory.files[0].path),'bad');
  await assert.rejects(verifyModel(f.source,{inventory}),/incomplete/);
  const external=path.join(f.root,'external');await writeFile(external,bytes);
  await rm(path.join(f.source,inventory.files[0].path));await symlink(external,path.join(f.source,inventory.files[0].path));
  await assert.rejects(verifyModel(f.source,{inventory}),/outside/);
});
test('Unsafe redirect is refused before contacting its host',async t=>{
  const f=await setup(t);let calls=0;
  await assert.rejects(installModel(null,{destination:f.destination,inventory,fetcher:async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://untrusted.example/model'}});}}),/unapproved/);
  assert.equal(calls,1);assert.ok(!(await readdir(f.root)).some(n=>n.startsWith('.install-')));
});
test('Exact byte count and checksum are required before installation',async t=>{
  const f=await setup(t);
  await assert.rejects(installModel(null,{destination:f.destination,inventory,fetcher:async()=>new Response(Buffer.alloc(bytes.length,1))}),/incomplete/);
  await assert.rejects(installModel(null,{destination:f.destination,inventory,fetcher:async()=>new Response(Buffer.alloc(bytes.length+1,1))}),/exceeds/);
});
test('Cancellation clears staging while a valid model is never replaced',async t=>{
  const f=await setup(t);const controller=new AbortController();controller.abort();
  await assert.rejects(installModel(null,{destination:f.destination,inventory,signal:controller.signal}));
  await installModel(f.source,{destination:f.destination,inventory});
  assert.equal(await installModel(null,{destination:f.destination,inventory,fetcher:()=>{throw new Error('Unexpected download');}}),f.destination);
});
test('Malformed manifest cannot write outside staging or contact the network',async t=>{
  const f=await setup(t);let calls=0;
  for(const filePath of ['../escape','/absolute','Encoder/../../escape','Encoder\\escape']) {
    await assert.rejects(installModel(null,{destination:f.destination,inventory:{...inventory,files:[{...inventory.files[0],path:filePath}]},fetcher:()=>{calls++;}}),/manifest/);
  }
  assert.equal(calls,0);assert.deepEqual(await readdir(f.root),['source']);
});
test('Pinned publisher CDN redirect installs only hash-verified bytes',async t=>{
  const f=await setup(t);let calls=0;
  await installModel(null,{destination:f.destination,inventory,fetcher:async url=>{
    calls++;
    if(calls===1)return new Response(null,{status:302,headers:{location:'https://us.aws.cdn.hf.co/test-model'}});
    assert.equal(url.hostname,'us.aws.cdn.hf.co');return new Response(bytes);
  }});
  assert.equal(calls,2);await verifyModel(f.destination,{inventory});
});
test('Repair retains a damaged installation until its verified replacement is ready',async t=>{
  const f=await setup(t);await mkdir(f.destination);await writeFile(path.join(f.destination,'damaged'),'recoverable');
  await installModel(f.source,{destination:f.destination,inventory});await verifyModel(f.destination,{inventory});
  const backup=(await readdir(f.root)).find(n=>n.includes('.replaced-invalid-'));
  assert.equal(await readFile(path.join(f.root,backup,'damaged'),'utf8'),'recoverable');
});
test('An existing renamed model is reused only with the same verified bytes and safe alias',async t=>{
  const f=await setup(t);
  await writeFile(path.join(f.source,'renamed.bin'),bytes);
  const aliases={[inventory.files[0].path]:'renamed.bin'};
  await installModel(f.source,{destination:f.destination,inventory,aliases,fetcher:()=>{throw new Error('Unexpected download');}});
  await verifyModel(f.destination,{inventory});
  for(const alias of ['../escape','/outside','folder\\escape'])await assert.rejects(verifyModel(f.source,{inventory,aliases:{[inventory.files[0].path]:alias}}),/filename/);
});

test('Discovery skips a damaged likely location and imports the next verified model',async t=>{
  const f=await setup(t),damaged=path.join(f.root,'damaged');
  await mkdir(damaged);await writeFile(path.join(damaged,'renamed.bin'),'incorrect weights');
  await writeFile(path.join(f.source,'renamed.bin'),bytes);
  const aliases={[inventory.files[0].path]:'renamed.bin'};
  const found=await discoverCandidates([
    path.join(f.root,'absent'),{source:damaged,aliases},{source:f.source,aliases},
  ],{inventory,destination:f.destination});
  assert.equal(found,f.destination);await verifyModel(found,{inventory});
  assert.deepEqual(await readFile(path.join(f.source,'renamed.bin')),bytes);
  assert.equal(await readFile(path.join(damaged,'renamed.bin'),'utf8'),'incorrect weights');
});
