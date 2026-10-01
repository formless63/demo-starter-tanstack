import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {PgBoss} from 'pg-boss';
assert(process.env.DATABASE_URL);const admin=new pg.Pool({connectionString:process.env.DATABASE_URL});const name=`project_transfer_${randomUUID().replaceAll('-','')}`;const url=new URL(process.env.DATABASE_URL);url.pathname=`/${name}`;
process.env.DATABASE_URL=url.toString();process.env.PGBOSS_DATABASE_URL=url.toString();
const pool=new pg.Pool({connectionString:url.toString()});const migrationBoss=new PgBoss({connectionString:url.toString(),migrate:true});
let cleanup:(()=>Promise<void>)|undefined;
try {
 await admin.query(`CREATE DATABASE "${name}"`);await migrate(drizzle(pool),{migrationsFolder:'drizzle'});await migrationBoss.start();await migrationBoss.stop();
 const {applicationTransfers}=await import('../src/lib/import-export.server');const {db}=await import('../src/db');const {stopJobsClient}=await import('../src/integrations/jobs/client.server');const {getStorage}=await import('../src/integrations/storage/storage.server');
 cleanup=async()=>{const rows=await pool.query('select id,status from import_export_transfer');for(const row of rows.rows){if(!['succeeded','failed','cancelled'].includes(row.status))await pool.query("update import_export_transfer set status='cancelled' where id=$1",[row.id]);await applicationTransfers.purgeTransferArtifacts([row.id],{execute:true});}await stopJobsClient();getStorage().close();await db.$client.end();};
 const owner=`project-owner-${randomUUID()}`;const other=`project-other-${randomUUID()}`;
 await pool.query('INSERT INTO "user"(id,name,email) VALUES($1,$1,$1||\'@example.test\'),($2,$2,$2||\'@example.test\')',[owner,other]);
 await pool.query('INSERT INTO project(id,owner_id,name,description) VALUES($1,$2,$3,NULL),($4,$5,\'private-other\',\'secret\')',[randomUUID(),owner,'Personal, "quoted"',randomUUID(),other]);
 const ctx={requesterId:owner,scope:{kind:'user' as const,id:owner}};
 const exported=await applicationTransfers.requestExport(ctx,{definition:'projects',idempotencyKey:'project-export'});await applicationTransfers.run(exported.id);const download=await applicationTransfers.getExportDownload(ctx,exported.id);const csv=await (await fetch(download.url)).text();assert.equal(csv,'name,description\r\n"Personal, ""quoted""",\r\n');assert(!csv.includes('private-other'));
 const imported=await applicationTransfers.stageImport(ctx,{definition:'projects',body:Readable.from([Buffer.from(csv)])});await applicationTransfers.startImport(ctx,{transferId:imported.id,idempotencyKey:'project-import'});await applicationTransfers.run(imported.id);assert.equal((await applicationTransfers.getTransfer(ctx,imported.id)).status,'succeeded');assert.equal((await pool.query('select * from project where owner_id=$1',[owner])).rowCount,2);assert.equal((await pool.query('select * from project where owner_id=$1',[other])).rowCount,1);assert.equal((await pool.query('select * from audit_event')).rowCount,1);
 const zero=await applicationTransfers.stageImport(ctx,{definition:'projects',body:Readable.from([Buffer.from('name,description\r\n')])});await applicationTransfers.startImport(ctx,{transferId:zero.id,idempotencyKey:'project-zero'});await applicationTransfers.run(zero.id);assert.equal((await applicationTransfers.getTransfer(ctx,zero.id)).rowCount,0);assert.equal((await pool.query('select * from audit_event')).rowCount,1);
 console.info('Real personal Projects CSV round-trip: quoted name/null description, fresh IDs/current owner, other owner excluded, atomic Audit and zero-row no mutations passed');
} finally {await cleanup?.();await migrationBoss.stop({graceful:false});await pool.end();await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await admin.end();}
