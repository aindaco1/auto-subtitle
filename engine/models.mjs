import { constants } from 'node:fs';
import { readFile, lstat, realpath, mkdir, copyFile, rename, rm, open, statfs } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { root, hashFile, binary, run } from './process.mjs';

export const store = path.join(os.homedir(),'Library/Application Support/Auto Subtitle');
export const manifest = JSON.parse(await readFile(path.join(root,'resources/model-manifests/parakeet-v3.json'),'utf8'));
export const modelDirectory = path.join(store,'Models',manifest.folder);
const inside=(parent,child)=>child===parent||child.startsWith(parent+path.sep);
function validateInventory(inventory) {
  if(!inventory || !/^[\w-]+\/[\w.-]+$/.test(inventory.repository) || !/^[a-f0-9]{6,64}$/.test(inventory.revision) || !Array.isArray(inventory.files) || !inventory.files.length)throw new Error('Invalid model manifest.');
  const seen=new Set();let total=0;
  for(const file of inventory.files) {
    if(typeof file.path!=='string'||path.isAbsolute(file.path)||file.path.includes('\\')||file.path.split('/').some(p=>!p||p==='..'||p==='.')||seen.has(file.path)||!Number.isSafeInteger(file.size)||file.size<1||!/^[a-f0-9]{64}$/.test(file.sha256))throw new Error('Invalid model manifest.');
    seen.add(file.path);total+=file.size;
  }
  if(!Number.isSafeInteger(total)||total!==inventory.bytes)throw new Error('Invalid model manifest.');
}

export async function verifyModel(directory, { cacheRoot=directory, inventory=manifest, aliases={} }={}) {
  validateInventory(inventory);
  const base=await realpath(cacheRoot);
  for(const file of inventory.files) {
    if(path.isAbsolute(file.path)||file.path.split('/').some(p=>!p||p==='..'||p==='.')||!Number.isSafeInteger(file.size)||file.size<1||!/^[a-f0-9]{64}$/.test(file.sha256))throw new Error('Invalid model manifest.');
    const sourcePath=aliases[file.path]??file.path;
    if(typeof sourcePath!=='string'||path.isAbsolute(sourcePath)||sourcePath.includes('\\')||sourcePath.split('/').some(p=>!p||p==='..'||p==='.'))throw new Error('Invalid model source filename.');
    const target=await realpath(path.join(directory,sourcePath));
    if(!inside(base,target)) throw new Error('Model files point outside the selected folder.');
    const info=await lstat(target);
    if(!info.isFile()||info.size!==file.size||await hashFile(target)!==file.sha256) throw new Error('This speech model is incomplete or does not match the verified version.');
  }
  return directory;
}
async function enoughSpace(parent, bytes) {
  await mkdir(parent,{recursive:true,mode:0o700});
  const info=await statfs(parent);
  if(info.bavail*info.bsize<bytes+64*1024*1024) throw new Error(`Free at least ${Math.ceil((bytes+64*1024*1024)/1e6)} MB to install the speech model.`);
}
export async function installModel(source, { signal, progress=()=>{}, cacheRoot=source, destination=modelDirectory, inventory=manifest, aliases={}, fetcher=fetch }={}) {
  validateInventory(inventory);
  try {await verifyModel(destination,{inventory});return destination;}catch{}
  if(source) await verifyModel(source,{cacheRoot,inventory,aliases});
  const parent=path.dirname(destination); await enoughSpace(parent,inventory.bytes);
  const staging=path.join(parent,'.install-'+randomUUID()); await mkdir(staging,{mode:0o700});
  let done=0;
  try {
    for(const file of inventory.files) {
      signal?.throwIfAborted();
      const target=path.join(staging,file.path); await mkdir(path.dirname(target),{recursive:true});
      if(source) {
        await copyFile(await realpath(path.join(source,aliases[file.path]??file.path)),target,constants.COPYFILE_EXCL|constants.COPYFILE_FICLONE);
        done+=file.size; progress(done/inventory.bytes);
      } else {
        let url=new URL(`https://huggingface.co/${inventory.repository}/resolve/${inventory.revision}/${file.path}`),response;
        const hosts=new Set(['huggingface.co','cdn-lfs.hf.co','cdn-lfs-us-1.hf.co','cas-bridge.xethub.hf.co','us.aws.cdn.hf.co']);
        for(let redirects=0;redirects<=5;redirects++) {
          if(url.protocol!=='https:'||url.username||url.password||!hosts.has(url.hostname)||url.port) throw new Error('The model publisher redirected to an unapproved address.');
          response=await fetcher(url,{redirect:'manual',signal:AbortSignal.any([signal??new AbortController().signal,AbortSignal.timeout(30*60*1000)])});
          if(response.status>=300&&response.status<400) {const location=response.headers.get('location');await response.body?.cancel();if(!location)throw new Error('Invalid model redirect.');url=new URL(location,url);continue;}
          break;
        }
        if(!response?.ok||!response.body)throw new Error('The model download failed. Check the connection and retry.');
        let received=0;
        const handle=await open(target,'wx',0o600);
        try {for await(const block of response.body) { signal?.throwIfAborted(); received+=block.length;if(received>file.size)throw new Error('The download exceeds its verified size.');await handle.writeFile(block);progress((done+received)/inventory.bytes); }}finally{await handle.close();}
        if(received!==file.size)throw new Error('The model download was interrupted. Retry to install it.');
        done+=received;
      }
    }
    await verifyModel(staging,{inventory});
    // A verified replacement may repair the app-owned folder; preserve the old copy.
    let backup;
    try {
      const existing=await lstat(destination);
      if(!existing.isDirectory()||existing.isSymbolicLink())throw new Error('The model destination is not a regular folder.');
      try {await verifyModel(destination,{inventory});return destination;}catch{}
      backup=destination+'.replaced-invalid-'+randomUUID();await rename(destination,backup);
    }catch(error){if(error.code!=='ENOENT')throw error;}
    try {await rename(staging,destination);}catch(error){if(backup)await rename(backup,destination);throw error;}
    return destination;
  } finally {await rm(staging,{recursive:true,force:true});}
}
export async function discoverCandidates(candidates, {inventory=manifest,destination=modelDirectory,progress=()=>{},signal}={}) {
  for(const candidate of candidates) {
    signal?.throwIfAborted();
    const {source,cacheRoot=source,aliases={}}=typeof candidate==='string'?{source:candidate}:candidate;
    try {
      await verifyModel(source,{cacheRoot,inventory,aliases});
      return source===destination?source:await installModel(source,{inventory,destination,cacheRoot,aliases,progress,signal});
    }catch(error){signal?.throwIfAborted();}
  }
  return null;
}
export async function discoverModel({ progress=()=>{} }={}) {
  const home=os.homedir(),app=path.join(home,'Library/Application Support');
  const candidates=[modelDirectory];
  try { candidates.push(JSON.parse((await run(binary('auto-subtitle-speech'),['cache'])).trim()).path); }catch{}
  for(const name of ['PodcastVisualizer','Podcast Visualizer','Record']) for(const models of ['Models','models']) candidates.push(path.join(app,name,models,manifest.folder));
  candidates.push(path.join(home,'Downloads',manifest.folder),path.join(home,'Downloads','parakeet-tdt-0.6b-v3-coreml'));
  if(!root.includes('.app/'))candidates.push(path.resolve(root,'../podcast-visualizer/models',manifest.folder));
  const hf=path.join(home,'.cache/huggingface/hub','models--FluidInference--parakeet-tdt-0.6b-v3-coreml');
  candidates.push(path.join(hf,'snapshots',manifest.revision));
  return discoverCandidates([...new Set(candidates)].map(source=>({source,cacheRoot:source.startsWith(hf+path.sep)?hf:source})),{progress});
}
