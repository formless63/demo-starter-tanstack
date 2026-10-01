import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import pg from 'pg';
const name=`import-export-pg-${randomUUID().slice(0,8)}`;
const docker=(args:string[])=> {const result=spawnSync('docker',args,{encoding:'utf8'});if(result.status!==0)throw new Error(`Disposable Docker fixture failed: ${args[0]}`);return result.stdout.trim();};
let pool:pg.Pool|undefined;
try {
 docker(['run','-d','--name',name,'-e','POSTGRES_USER=fixture','-e','POSTGRES_PASSWORD=fixture-only','-e','POSTGRES_DB=fixture','-p','127.0.0.1::5432','postgres:18.1-alpine']);
 const port=docker(['port',name,'5432/tcp']).split(':').at(-1);
 const databaseUrl=`postgresql://fixture:fixture-only@127.0.0.1:${port}/fixture`;pool=new pg.Pool({connectionString:databaseUrl,connectionTimeoutMillis:1000});
 let ready=false;for(let i=0;i<60;i++){try{await pool.query('select 1');ready=true;break;}catch{await setTimeout(500);}}if(!ready)throw new Error('Fixture PostgreSQL unavailable');
 const result=spawnSync(process.execPath,['scripts/storage-compat.ts'],{stdio:'inherit',env:{...process.env,DATABASE_URL:databaseUrl,STORAGE_SMOKE_SCRIPT:process.env.IMPORT_EXPORT_FIXTURE_SCRIPT??'scripts/import-export-fixture.ts'}});if(result.status!==0)throw new Error('Import/export two-provider contract failed');
} finally {await pool?.end();docker(['rm','-f','-v',name]);}
