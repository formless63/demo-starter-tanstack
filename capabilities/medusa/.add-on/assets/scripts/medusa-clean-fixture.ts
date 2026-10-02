import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
assert.equal(JSON.parse(await readFile('.cta.json','utf8')).projectName,'medusa-addon-clean-install');
const directory=await mkdtemp(`${tmpdir()}/medusa-lifecycle-`);
const run=(command:string,args:string[],env=process.env)=>{assert.equal(spawnSync(command,args,{stdio:'inherit',env}).status,0,`${command} ${args.join(' ')} failed`);};
try{
 run(process.execPath,['scripts/medusa-unit.ts']);run(process.execPath,['build','scripts/medusa-protocol-fixture.ts','--target=node',`--outfile=${directory}/protocol.mjs`]);run('node',[`${directory}/protocol.mjs`]);
 run(process.execPath,['scripts/medusa-database-fixture.ts']);
 run(process.execPath,['x','tsc','--noEmit']);run(process.execPath,['run','build']);
 run(process.execPath,['build','scripts/medusa-database-fixture.ts','--target=node',`--outfile=${directory}/database.mjs`]);
 run('node',[`${directory}/database.mjs`],{...process.env,MEDUSA_FIXTURE_REMOVE:'true',MEDUSA_FIXTURE_BUN:process.execPath});
 run(process.execPath,['x','tsc','--noEmit']);
}finally{await rm(directory,{recursive:true,force:true});}
