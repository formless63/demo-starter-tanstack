import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Readable} from 'node:stream';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {eq,sql} from 'drizzle-orm';
import {PgBoss,fromDrizzle} from 'pg-boss';
import {z} from 'zod';
import * as schema from '../src/db/schema';
import {createTransferTransactions} from '../src/integrations/import-export/database.server';
import {createTransferRegistry} from '../src/integrations/import-export/registry.server';
import {createTransfers,transferQueue} from '../src/integrations/import-export/service.server';
import {transfers} from '../src/integrations/import-export/schema';
import {createStorage} from '../src/integrations/storage/storage.server';
const name=`retention_${randomUUID().replaceAll('-','')}`;assert(process.env.DATABASE_URL);const url=new URL(process.env.DATABASE_URL);const admin=new pg.Pool({connectionString:url.toString()});url.pathname=`/${name}`;const pool=new pg.Pool({connectionString:url.toString()});const db=drizzle(pool);const boss=new PgBoss({connectionString:url.toString(),migrate:true});const storage=createStorage();const keys:string[]=[];
try{
 await admin.query(`CREATE DATABASE "${name}"`);await migrate(db,{migrationsFolder:'drizzle'});await pool.query('create table retained_domain(value text)');await boss.start();await boss.createQueue(transferQueue,{retryLimit:5,retryDelay:30,retryBackoff:true,retryDelayMax:900,expireInSeconds:90,deleteAfterSeconds:86400});
 const registry=createTransferRegistry([{name:'fixture',version:'1',columns:['name'],rowSchema:z.object({name:z.string()}),authorize:async()=>true,importRows:async(tx,rows)=>{for(const row of rows)await tx.execute(sql`insert into retained_domain values(${(row as {name:string}).name})`);},async *exportRows(tx){const result=await tx.execute<{value:string}>(sql`select value from retained_domain order by value`);for(const row of result.rows)yield[row.value];}}]);
 const service=createTransfers({transaction:createTransferTransactions(()=>url.toString(),schema),registry,storage:()=>storage,jobs:async()=>boss,enqueue:async(tx,id)=>{const job=await boss.send(transferQueue,{transferId:id},{retryLimit:5,retryDelay:30,retryBackoff:true,retryDelayMax:900,expireInSeconds:90,deleteAfterSeconds:86400,db:fromDrizzle(tx,sql)});assert(job);return job;}});const ctx={requesterId:'opaque-fixture-owner',scope:{kind:'user' as const,id:'opaque-fixture-owner'}};
 await boss.work(transferQueue,{includeMetadata:true,pollingIntervalSeconds:0.5},async([job])=>service.run((job.data as {transferId:string}).transferId,{id:job.id,signal:job.signal,retryCount:job.retryCount,retryLimit:job.retryLimit}));
 const source=await service.stageImport(ctx,{definition:'fixture',body:Readable.from([Buffer.from('name\r\nretained-content\r\n')])});await service.startImport(ctx,{transferId:source.id,idempotencyKey:'retained-source'});
 const wait=async(id:string)=>{for(let i=0;i<120;i++){const [row]=await db.select().from(transfers).where(eq(transfers.id,id));const job=row.jobId?await boss.getJobById(transferQueue,row.jobId):null;if(row.status==='succeeded'&&job?.state==='completed')return row;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Retention fixture transfer deadline');};
 const input=await wait(source.id);const outputReceipt=await service.requestExport(ctx,{definition:'fixture',idempotencyKey:'retained-output'});const output=await wait(outputReceipt.id);await boss.offWork(transferQueue);assert(input.sourceKey&&output.outputKey);keys.push(input.sourceKey,output.outputKey);
 const jobs=await Promise.all([input,output].map(row=>boss.getJobById(transferQueue,row.jobId!)));const history=(await pool.query('select hash,created_at from drizzle.__drizzle_migrations order by id')).rows;const records=await db.select().from(transfers).orderBy(transfers.id);const heads=await Promise.all(keys.map(key=>storage.headObject(key)));
 assert.equal(spawnSync(process.execPath,['scripts/import-export-remove-fixture.ts'],{stdio:'inherit',env:process.env}).status,0);
 assert.deepEqual(await Promise.all([input,output].map(row=>boss.getJobById(transferQueue,row.jobId!))),jobs);assert.deepEqual(await db.select().from(transfers).orderBy(transfers.id),records);assert.deepEqual((await pool.query('select hash,created_at from drizzle.__drizzle_migrations order by id')).rows,history);assert.equal((await pool.query('select value from retained_domain')).rows[0].value,'retained-content');assert.deepEqual(await Promise.all(keys.map(key=>storage.headObject(key))),heads);
 for(const key of keys){const result=await storage.getObject(key);const chunks:Buffer[]=[];for await(const chunk of result.body as AsyncIterable<Uint8Array>)chunks.push(Buffer.from(chunk));assert.equal(Buffer.concat(chunks).toString(),'name\r\nretained-content\r\n');}
 console.info('Final code/package removal and rebuild preserve exact completed native jobs, both receipts, domain data, migration history, source object and output object');
}finally{for(const key of keys)await storage.deleteObject(key);storage.close();await boss.stop({graceful:false});await pool.end();await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await admin.end();}
