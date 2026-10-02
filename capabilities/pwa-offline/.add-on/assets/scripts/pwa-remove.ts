import assert from 'node:assert/strict';
import { readFile,writeFile,rm } from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Only a disposable fixture may use this automated removal; never a production retirement assertion.
assert.equal(JSON.parse(await readFile('package.json','utf8')).name,'pwa-offline-clean-install');
const proof=JSON.parse(await readFile('.pwa-retirement-proof.json','utf8'));
assert.equal(proof.scope,'/');assert.equal(proof.filename,'pwa-offline-sw.js');
assert.equal(createHash('sha256').update(await readFile('public/pwa-offline-sw.js')).digest('hex'),proof.sha256,'Exact browser-tested retirement artifact retained');
let vite=await readFile('vite.config.ts','utf8');vite=vite.replace(/^import .*pwaOffline.*\n/m,'').replace(/\.\.\.pwaOffline\(\),?\s*/,'');await writeFile('vite.config.ts',vite);
for(const path of ['src/integrations/pwa-offline','src/routes/pwa-test.tsx','public/pwa-offline','capabilities/pwa-offline','scripts/pwa-vite.ts','scripts/pwa-unit.ts','scripts/pwa-worker-unit.ts','scripts/pwa-browser.ts','scripts/pwa-client-fixture.tsx','scripts/pwa-fixture-route.ts','scripts/pwa-consumer-production.ts'])await rm(path,{recursive:true,force:true});
const pkg=JSON.parse(await readFile('package.json','utf8'));for(const key of Object.keys(pkg.scripts))if(key.startsWith('pwa:'))delete pkg.scripts[key];
for(const key of ['vite-plugin-pwa','workbox-build','@playwright/test'])delete pkg.devDependencies[key];
await writeFile('package.json',`${JSON.stringify(pkg,null,2)}\n`);
console.info('Fixture source removed; SAME-URL retirement worker and proof retained. Production requires a separate deployed retirement phase for returning clients.');
