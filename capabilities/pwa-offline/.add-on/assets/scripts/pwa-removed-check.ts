import {startConsumer} from './pwa-consumer-server';
import assert from 'node:assert/strict';
import { readFile,access } from 'node:fs/promises';
import {createHash} from 'node:crypto';
assert.equal(JSON.parse(await readFile('package.json','utf8')).name,'pwa-offline-clean-install');
const proof=JSON.parse(await readFile('.pwa-retirement-proof.json','utf8'));
assert.equal(createHash('sha256').update(await readFile('dist/client/pwa-offline-sw.js')).digest('hex'),proof.sha256,'Final lean build retains SAME-URL retirement artifact');
await assert.rejects(()=>access('src/integrations/pwa-offline'));
await assert.rejects(()=>access('dist/client/manifest.webmanifest'));
console.info('Final lean build keeps retirement tombstone, without feature source or manifest. Browser retirement proof is fixture-specific, not a production claim.');

const server=await startConsumer();try{const response=await fetch(`${server.origin}/pwa-offline-sw.js`);assert.equal(response.status,200);assert.match(response.headers.get('content-type')??'',/javascript/);assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),proof.sha256);assert.equal((await fetch(`${server.origin}/`)).status,200);console.info('Final lean actual Start HTTP serves exact retirement worker at the original URL and remains online');}finally{await server.close();}
