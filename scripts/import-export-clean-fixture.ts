import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile,rm,writeFile } from 'node:fs/promises';
const cta=JSON.parse(await readFile('.cta.json','utf8'));assert.equal(cta.projectName,'import-export-addon-clean-install');
const run=(args:string[])=>{const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});assert.equal(result.status,0);};
run(['scripts/import-export-compat.ts']);run(['run','build']);
// Runtime removal retains source schema/explicit migration history and dependencies.
for(const file of ['service.server.ts','registry.server.ts','jobs.server.ts','config.server.ts','csv.server.ts'])await rm(`src/integrations/import-export/${file}`);
await rm('src/lib/import-export.server.ts');
const registry=await readFile('src/integrations/jobs/registry.ts','utf8');await writeFile('src/integrations/jobs/registry.ts',registry.split('\n').filter(line=>!line.includes('referenceTransferJobs')).join('\n'));
const pkg=JSON.parse(await readFile('package.json','utf8'));delete pkg.dependencies['csv-parse'];delete pkg.dependencies['csv-stringify'];for(const key of Object.keys(pkg.scripts))if(key.startsWith('import-export:'))delete pkg.scripts[key];await writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');
for(const file of ['import-export-fixture.ts','import-export-compat.ts','import-export-operator.ts','import-export-unit.ts'])await rm(`scripts/${file}`);
assert(pkg.dependencies['pg-boss']);assert(pkg.dependencies['@aws-sdk/client-s3']);assert(await readFile('src/integrations/import-export/schema.ts'));assert(await readFile('drizzle/0006_parched_darwin.sql'));assert(await readFile('drizzle/meta/_journal.json'));
run(['install']);run(['x','tsc','--noEmit']);run(['run','build']);console.info('Import/export clean removal retains Jobs/Storage packages, schema and migrations');
