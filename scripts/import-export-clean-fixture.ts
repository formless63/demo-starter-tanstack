import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import { spawnSync } from 'node:child_process';
import { readFile,rm,writeFile } from 'node:fs/promises';
const cta=JSON.parse(await readFile('.cta.json','utf8'));assert.equal(cta.projectName,'import-export-addon-clean-install');
const run=(args:string[])=>{const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});assert.equal(result.status,0);};
run(['scripts/import-export-compat.ts']);run(['run','build']);
const resource=`ie-removal-${randomUUID().slice(0,8)}`;
const docker=(args:string[])=>{const result=spawnSync('docker',args,{encoding:'utf8'});assert.equal(result.status,0);return result.stdout.trim();};
let pool:pg.Pool|undefined;
try {
 docker(['run','-d','--name',resource,'-e','POSTGRES_USER=fixture','-e','POSTGRES_PASSWORD=fixture-only','-e','POSTGRES_DB=fixture','-p','127.0.0.1::5432','postgres:18.1-alpine']);
 const port=docker(['port',resource,'5432/tcp']).split(':').at(-1);pool=new pg.Pool({connectionString:`postgresql://fixture:fixture-only@127.0.0.1:${port}/fixture`,connectionTimeoutMillis:1000});let ready=false;for(let i=0;i<60;i++){try{await pool.query('select 1');ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,500));}}assert(ready);
 await migrate(drizzle(pool),{migrationsFolder:'drizzle'});const receipt=randomUUID();await pool.query("insert into import_export_transfer(id,requester_id,scope_kind,scope_id,definition,version,direction,status,created_at,updated_at,idempotency_key,fingerprint) values($1,'opaque-owner','user','opaque-owner','fixture','1','import','succeeded',now(),now(),'retained-key',$2)",[receipt,'a'.repeat(64)]);
 await pool.query("create table removal_domain_fixture(value text);insert into removal_domain_fixture values('retained domain data')");const before=(await pool.query('select hash,created_at from drizzle.__drizzle_migrations order by id')).rows;
// Runtime removal retains source schema/explicit migration history and dependencies.
for(const file of ['service.server.ts','registry.server.ts','jobs.server.ts','config.server.ts','csv.server.ts','database.server.ts'])await rm(`src/integrations/import-export/${file}`);
await rm('src/lib/import-export.server.ts');
const registry=await readFile('src/integrations/jobs/registry.ts','utf8');await writeFile('src/integrations/jobs/registry.ts',registry.split('\n').filter(line=>!line.includes('referenceTransferJobs')).join('\n'));
const pkg=JSON.parse(await readFile('package.json','utf8'));delete pkg.dependencies['csv-parse'];delete pkg.dependencies['csv-stringify'];for(const key of Object.keys(pkg.scripts))if(key.startsWith('import-export:'))delete pkg.scripts[key];await writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');
for(const file of ['import-export-fixture.ts','import-export-compat.ts','import-export-operator.ts','import-export-unit.ts'])await rm(`scripts/${file}`);
assert(pkg.dependencies['pg-boss']);assert(pkg.dependencies['@aws-sdk/client-s3']);assert(await readFile('src/integrations/import-export/schema.ts'));assert(await readFile('drizzle/0006_parched_darwin.sql'));assert(await readFile('drizzle/meta/_journal.json'));
run(['install']);run(['x','tsc','--noEmit']);run(['run','build']);console.info('Import/export clean removal retains Jobs/Storage packages, schema and migrations');

 assert.deepEqual((await pool.query('select hash,created_at from drizzle.__drizzle_migrations order by id')).rows,before);const retained=(await pool.query('select id,status,idempotency_key from import_export_transfer where id=$1',[receipt])).rows[0];assert.deepEqual(retained,{id:receipt,status:'succeeded',idempotency_key:'retained-key'});assert.equal((await pool.query('select value from removal_domain_fixture')).rows[0].value,'retained domain data');console.info('Code/package removal leaves actual PostgreSQL receipt, idempotency identity, domain records and applied migration history intact');
} finally {await pool?.end();docker(['rm','-f','-v',resource]);}
