import { copyFile } from 'node:fs/promises';
import path from 'node:path';
const relay=process.argv[2];
if(!relay)throw new Error('Pass the existing ASCII VJ Remix crash-relay directory.');
await copyFile('engine/diagnostics-contract.mjs',path.join(relay,'src/auto-subtitle-contract.mjs'));
await copyFile('integrations/crash-relay/auto-subtitle-aggregation.js',path.join(relay,'src/auto-subtitle-aggregation.js'));
