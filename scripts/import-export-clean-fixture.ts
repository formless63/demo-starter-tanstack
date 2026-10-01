import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
assert.equal(JSON.parse(await readFile('.cta.json','utf8')).projectName,'import-export-addon-clean-install');
const run=(args:string[],env=process.env)=>assert.equal(spawnSync(process.execPath,args,{stdio:'inherit',env}).status,0);
run(['scripts/import-export-compat.ts']);run(['run','build']);
const directory=await mkdtemp(`/tmp/ie-retention-${randomUUID().slice(0,8)}-`);const kernel=`${directory}/retention.mjs`;const orchestrator=`${directory}/compat.mjs`;
try{
 run(['build','scripts/import-export-retention-fixture.ts','--target=bun',`--outfile=${kernel}`]);run(['build','scripts/import-export-compat.ts','--target=bun',`--outfile=${orchestrator}`]);
 run([orchestrator],{...process.env,IMPORT_EXPORT_FIXTURE_SCRIPT:kernel});
 console.info('Import/export clean removal retains hard dependency packages and exact persistent resources on both providers');
}finally{await rm(directory,{recursive:true,force:true});await rm('scripts/import-export-remove-fixture.ts',{force:true});}
