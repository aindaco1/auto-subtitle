import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Release versions agree and updates use the official feed and dedicated signing key',async()=>{
  const read=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');
  const version=JSON.parse(await read('package.json')).version,plist=await read('macos/Info.plist');
  const value=key=>plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`))?.[1];
  assert.equal(value('CFBundleShortVersionString'),version);
  assert.match(await read('pyproject.toml'),new RegExp(`version = "${version.replaceAll('.','\\.')}"`));
  assert.match(await read('src/auto_subtitle/__init__.py'),new RegExp(`__version__ = "${version.replaceAll('.','\\.')}"`));
  assert.equal(value('SUFeedURL'),'https://github.com/aindaco1/auto-subtitle/releases/latest/download/appcast.xml');
  assert.equal(value('SUPublicEDKey'),(await read('resources/sparkle-public-key.txt')).trim());
  assert.equal(Buffer.from(value('SUPublicEDKey'),'base64').length,32);
  for(const key of ['SUAllowsAutomaticUpdates','SUAutomaticallyUpdate','SUEnableSystemProfiling'])assert.match(plist,new RegExp(`<key>${key}</key>\\s*<false/>`));
});
