import * as transferDatabaseSchema from "../src/db/schema";
import { createTransferTransactions } from "../src/integrations/import-export/database.server";
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import { fromDrizzle, PgBoss } from 'pg-boss';
import { z } from 'zod';
import { createTransfers, transferQueue } from '../src/integrations/import-export/service.server';
import { createTransferRegistry } from '../src/integrations/import-export/registry.server';
import { transfers } from '../src/integrations/import-export/schema';
import { TransferError, type TransferContext } from '../src/integrations/import-export/validation';
import { createStorage } from '../src/integrations/storage/storage.server';
assert(process.env.DATABASE_URL);
const admin=new pg.Pool({connectionString:process.env.DATABASE_URL});
const name=`transfer_fixture_${randomUUID().replaceAll('-','')}`; const url=new URL(process.env.DATABASE_URL);url.pathname=`/${name}`;
const pool=new pg.Pool({connectionString:url.toString(),connectionTimeoutMillis:5000});
const db=drizzle(pool); const storage=createStorage(); const boss=new PgBoss({connectionString:url.toString(),migrate:true});
const owner:TransferContext={requesterId:'fixture-owner',scope:{kind:'user',id:'fixture-owner'}}; const foreign:TransferContext={requesterId:'fixture-other',scope:{kind:'user',id:'fixture-other'}};
let allowed=true; let failSql=false;
const registry=createTransferRegistry([{
 name:'projects',version:'1',columns:['name','description'],rowSchema:z.object({name:z.string().trim().min(1).max(120),description:z.string().trim().max(1000)}),
 async authorize(_tx,ctx) { return allowed && ctx.scope.kind==='user'; },
 async importRows(tx,rows,ctx,signal) { for(const raw of rows) {signal.throwIfAborted();const row=z.object({name:z.string(),description:z.string()}).parse(raw);await tx.execute(sql`insert into fixture_project(id,owner_id,name,description) values(${randomUUID()},${ctx.requesterId},${row.name},${row.description})`);if(failSql) throw new Error('private database error');} },
 async *exportRows(tx,ctx) { const result=await tx.execute<{name:string;description:string}>(sql`select name,description from fixture_project where owner_id=${ctx.requesterId} order by id`);for(const row of result.rows)yield[row.name,row.description]; },
}]);
const service=createTransfers({transaction:createTransferTransactions(()=>url.toString(),transferDatabaseSchema),registry,storage:()=>storage,jobs:async()=>boss,enqueue:async(tx,id)=> { const job=await boss.send(transferQueue,{transferId:id},{retryLimit:5,retryDelay:30,retryBackoff:true,retryDelayMax:900,expireInSeconds:90,deleteAfterSeconds:86400,db:fromDrizzle(tx,sql)});assert(job);return job;}});
const stage=(text:string)=>service.stageImport(owner,{definition:'projects',body:Readable.from(Array.from(Buffer.from(text),b=>Buffer.from([b])))});
const rejected=(code:string)=>(e:unknown)=>e instanceof TransferError && e.code===code;
try {
 await admin.query(`CREATE DATABASE "${name}"`);await migrate(db,{migrationsFolder:'drizzle'});
 await pool.query('create table fixture_project(id uuid primary key, owner_id text not null, name text not null,description text)');
 await boss.start();await boss.createQueue(transferQueue,{retryLimit:5,retryDelay:30,retryBackoff:true,retryDelayMax:900,expireInSeconds:90,deleteAfterSeconds:86400});
 const first=await stage('\ufeffname,description\r\n"é","line\n""quoted"""\r\n');assert.equal(first.status,'staged');
 await assert.rejects(service.getTransfer(foreign,first.id),rejected('not-found'));
 await assert.rejects(service.getTransfer({...owner,scope:{kind:'tenant',id:'foreign-tenant'}},first.id),rejected('not-found'));
 const start=await service.startImport(owner,{transferId:first.id,idempotencyKey:'same'});
 assert.deepEqual(await service.startImport(owner,{transferId:first.id,idempotencyKey:'same'}),start);
 await Promise.all([service.run(first.id),service.run(first.id)]);
 assert.equal((await pool.query('select * from fixture_project')).rowCount,1);assert.equal((await service.getTransfer(owner,first.id)).status,'succeeded');
 await service.run(first.id);assert.equal((await pool.query('select * from fixture_project')).rowCount,1);
 await assert.rejects(service.cancelTransfer(owner,first.id),rejected('conflict'));
 const second=await stage('name,description\none,two\n');await assert.rejects(service.startImport(owner,{transferId:second.id,idempotencyKey:'same'}),rejected('conflict'));
 const invalid=await stage('name,description\n,private-cell\n');await service.startImport(owner,{transferId:invalid.id,idempotencyKey:'invalid'});await service.run(invalid.id);assert.equal((await service.getTransfer(owner,invalid.id)).errorCode,'validation-failed');assert.equal((await pool.query('select * from fixture_project')).rowCount,1);
 const rollback=await stage('name,description\none,two\n');await service.startImport(owner,{transferId:rollback.id,idempotencyKey:'rollback'});failSql=true;await service.run(rollback.id);failSql=false;assert.equal((await pool.query('select * from fixture_project')).rowCount,1);
 const revoked=await stage('name,description\none,two\n');await service.startImport(owner,{transferId:revoked.id,idempotencyKey:'revoked'});allowed=false;await service.run(revoked.id);allowed=true;assert.equal((await service.getTransfer(owner,revoked.id)).errorCode,'forbidden');
 const cancelled=await stage('name,description\none,two\n');await service.startImport(owner,{transferId:cancelled.id,idempotencyKey:'cancelled'});await service.cancelTransfer(owner,cancelled.id);await service.cancelTransfer(owner,cancelled.id);await service.run(cancelled.id);assert.equal((await service.getTransfer(owner,cancelled.id)).status,'cancelled');
 const expired=await stage('name,description\none,two\n');await db.update(transfers).set({artifactExpiresAt:new Date(0)}).where(eq(transfers.id,expired.id));await assert.rejects(service.startImport(owner,{transferId:expired.id,idempotencyKey:'expired'}),rejected('expired'));
 const forged=await stage('name,description\none,two\n');await db.update(transfers).set({sourceHash:'0'.repeat(64)}).where(eq(transfers.id,forged.id));await service.startImport(owner,{transferId:forged.id,idempotencyKey:'forged'});await service.run(forged.id);assert.equal((await service.getTransfer(owner,forged.id)).errorCode,'invalid-format');
 const exported=await service.requestExport(owner,{definition:'projects',idempotencyKey:'export'});assert.deepEqual(await service.requestExport(owner,{definition:'projects',idempotencyKey:'export'}),exported);await assert.rejects(service.getExportDownload(owner,exported.id),rejected('conflict'));await service.run(exported.id);const download=await service.getExportDownload(owner,exported.id);assert.equal(download.expiresIn,600);const response=await fetch(download.url);assert.equal(response.status,200);assert.equal(await response.text(),'name,description\r\né,"line\n""quoted"""\r\n');
 await db.update(transfers).set({artifactExpiresAt:new Date(Date.now()+29000)}).where(eq(transfers.id,exported.id));await assert.rejects(service.getExportDownload(owner,exported.id),rejected('expired'));
 const lost=await stage('name,description\none,two\n');await service.startImport(owner,{transferId:lost.id,idempotencyKey:'lost'});const [lostRow]=await db.select().from(transfers).where(eq(transfers.id,lost.id));await boss.deleteJob(transferQueue,lostRow.jobId!);assert.equal((await service.reconcileTransfer(owner,lost.id)).errorCode,'execution-lost');
 const page=await service.listTransfers(owner,{limit:2});assert.equal(page.transfers.length,2);assert(page.cursor);assert.equal((await service.listTransfers(owner,{limit:2,cursor:page.cursor})).transfers.length,2);await assert.rejects(service.listTransfers(owner,{cursor:page.cursor+'='}),rejected('invalid-input'));
 const [artifact]=await db.select().from(transfers).where(eq(transfers.id,exported.id));assert(artifact.outputKey);assert.equal((await service.purgeTransferArtifacts([exported.id]))[0].executed,false);await storage.headObject(artifact.outputKey);await service.purgeTransferArtifacts([exported.id],{execute:true});await assert.rejects(storage.headObject(artifact.outputKey));assert.equal((await service.getTransfer(owner,exported.id)).status,'succeeded');
 console.info('Import/export real PostgreSQL18/pg-boss/S3 contract: scope, UTF8/CSV, idempotency, atomic rollback, duplicate attempts, revocation, cancel, expiry, integrity, export publication, cursor, reconciliation and explicit purge passed');
} finally {
 // Explicit selected fixture-only artifact cleanup; no arbitrary prefix deletion.
 try { const rows=await db.select().from(transfers);for(const row of rows) {if(!['succeeded','failed','cancelled'].includes(row.status)) await db.update(transfers).set({status:'cancelled'}).where(eq(transfers.id,row.id));await service.purgeTransferArtifacts([row.id],{execute:true});} } catch { /* Original fixture failure remains visible. */ }
 storage.close();await boss.stop({graceful:false});await pool.end();await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await admin.end();
}
