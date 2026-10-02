import assert from 'node:assert/strict';
import { readdir,readFile,writeFile,rm } from 'node:fs/promises';
assert.equal(JSON.parse(await readFile('.cta.json','utf8')).projectName,'medusa-addon-clean-install');
let registry=await readFile('src/integrations/jobs/registry.ts','utf8');registry=registry.replace(/^import .*referenceMedusaJobs.*\n/m,'').replace(/\s*\.\.\.referenceMedusaJobs,\n/,'\n');await writeFile('src/integrations/jobs/registry.ts',registry);
for(const file of await readdir('src/integrations/medusa'))if(!['schema.ts','projection.ts','contract.ts'].includes(file))await rm(`src/integrations/medusa/${file}`);
await rm('src/lib/medusa.server.ts');
for(const file of await readdir('scripts'))if(file.startsWith('medusa-'))await rm(`scripts/${file}`);
const pkg=JSON.parse(await readFile('package.json','utf8'));for(const key of Object.keys(pkg.scripts))if(key.startsWith('medusa:'))delete pkg.scripts[key];await writeFile('package.json',`${JSON.stringify(pkg,null,2)}\n`);
assert.ok(await readFile('drizzle/0013_medusa_v1.sql','utf8'));assert.ok(await readFile('drizzle/0014_medusa_receipt_conflicts.sql','utf8'));assert.ok(registry.includes('referenceWebhookJobs'));assert.ok(registry.includes('starter.echo'));
