import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {docker} from './cache-dev';
function run(args:string[],env:NodeJS.ProcessEnv={}){
 const result=spawnSync('bun',args,{stdio:'inherit',env:{...process.env,...env}});
 assert.equal(result.status,0,`Reference fixture failed: ${args.join(' ')}`);
}
const base=process.env.ADD_ON_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if(!base)throw new Error('Disposable local PostgreSQL fixture URL is required');
const configured=new URL(base);
if(!['localhost','127.0.0.1','[::1]','postgres'].includes(configured.hostname))throw new Error('Reference fixtures require local PostgreSQL');
const database=`ops_reference_${randomUUID().replaceAll('-','')}`;
const admin=new pg.Client({connectionString:base});let created=false;await admin.connect();
try{
 await admin.query(`CREATE DATABASE "${database}"`);created=true;
 const url=new URL(base);url.pathname=`/${database}`;
 const env={DATABASE_URL:url.toString(),PGBOSS_DATABASE_URL:url.toString(),PGBOSS_SCHEMA:'pgboss'};
 run(['run','jobs:migrate'],env);run(['scripts/ops-jobs-fixture.ts'],env);
}finally{if(created)await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);await admin.end();}
run(['scripts/ops-storage-failure-fixture.ts']);
run(['run','storage:compat'],{STORAGE_SMOKE_SCRIPT:'scripts/ops-storage-fixture.ts'});
const portServer=createServer();await new Promise<void>(resolve=>portServer.listen(0,'127.0.0.1',resolve));const address=portServer.address();if(!address||typeof address==='string')throw new Error();await new Promise<void>(resolve=>portServer.close(()=>resolve()));
const project=`ops-reference-cache-${randomUUID().slice(0,8)}`;
const args=['compose','-f','compose.cache.yaml','-p',project];
const environment={CACHE_DEV_PORT:String(address.port)};
try{
 docker([...args,'up','-d','--wait','--wait-timeout','45'],environment);
 run(['scripts/ops-cache-fixture.ts'],{OPS_CACHE_FIXTURE_PORT:String(address.port)});
}finally{docker([...args,'down','--volumes','--remove-orphans'],environment);}
console.info('Installed Ops reference read-only/no-retry/cancellation protocol boundaries passed');
