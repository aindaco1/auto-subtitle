import test from 'node:test';
import assert from 'node:assert/strict';
import { run, children } from '../process.mjs';

test('external cancellation kills descendants even after the leader leaves the registry',{skip:process.platform==='win32'},async()=>{
  const controller=new AbortController();let pid;
  const source=`const {spawn}=require("node:child_process");
    const child=spawn(process.execPath,["-e","process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"],{stdio:["ignore","pipe","ignore"]});
    child.stdout.once("data",()=>console.log(JSON.stringify({pid:child.pid})));setInterval(()=>{},1000);`;
  try {
    await assert.rejects(run(process.execPath,['-e',source],{signal:controller.signal,onEvent:event=>{pid=event.pid;controller.abort();}}),{name:'AbortError'});
    assert(Number.isInteger(pid)&&pid>0);
    let gone=false;
    for(let i=0;i<120;i++) {
      try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH'){gone=true;break;}throw error;}
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(gone,true);
    assert.equal(children.size,0);
  } finally {if(pid){try{process.kill(pid,'SIGKILL');}catch{}}}
});

test('argument vectors preserve spaces and shell metacharacters; progress stays JSON-only', async () => {
  const events=[];
  const output=await run(process.execPath,['-e','console.log(JSON.stringify({value:process.argv[1]}));console.log("noise")','a b;echo nope'],{onEvent:event=>events.push(event)});
  assert.deepEqual(events,[{value:'a b;echo nope'}]);
  assert.match(output,/noise/);
});
test('stream limit, spawn failure and signal exits reject and remove finished children', async () => {
  await assert.rejects(run(process.execPath,['-e','console.log("x".repeat(1024))'],{maxBytes:8}),/too much data/);
  await assert.rejects(run('/missing/processing-tool',[]),{code:'ENOENT'});
  await assert.rejects(run(process.execPath,['-e','process.kill(process.pid,"SIGTERM")']),error=>error.signal==='SIGTERM' && error.tool==='engine');
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(children.size,0);
});
test('stderr evidence stays bounded and callback parse failures do not stop tools',async()=>{
  const result=await run(process.execPath,['-e','console.log("{}");console.log("done")'],{onEvent:()=>{throw Error('ignored progress');}});
  assert.match(result,/done/);
  await assert.rejects(run(process.execPath,['-e','process.stderr.write("x".repeat(15000));process.exit(2)']),error=>error.message.length<=12000 && error.exitCode===2);
});
