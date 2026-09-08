import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run, cancelChildren, children } from '../process.mjs';

test('Cancellation terminates an active tool and blocks any later tool launch',async()=>{
  const child=run(process.execPath,['-e','setInterval(()=>{},1000)']);
  await new Promise(resolve=>setTimeout(resolve,100));
  const pid=[...children][0].pid;
  cancelChildren();await assert.rejects(child);
  await new Promise(resolve=>setTimeout(resolve,150));
  assert.throws(()=>process.kill(pid,0));
  assert.throws(()=>run(process.execPath,['-e','process.exit(0)']),/cancelled/);
});
