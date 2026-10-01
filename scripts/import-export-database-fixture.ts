import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import pg from 'pg';
import * as schema from '../src/db/schema';
import {createTransferTransactions} from '../src/integrations/import-export/database.server';
import {TransferError} from '../src/integrations/import-export/validation';
assert(process.env.DATABASE_URL);const name=`transfer_deadline_${randomUUID().replaceAll('-','')}`;const admin=new pg.Pool({connectionString:process.env.DATABASE_URL});const url=new URL(process.env.DATABASE_URL);url.pathname=`/${name}`;const pool=new pg.Pool({connectionString:url.toString()});
const transaction=createTransferTransactions(()=>url.toString(),schema);
try {
 await admin.query(`CREATE DATABASE "${name}"`);await pool.query('CREATE TABLE marker(value text)');
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(new TransferError('cancelled')),100);
 await assert.rejects(transaction(async tx=>{await tx.execute(sql`insert into marker values('rollback')`);await tx.execute(sql`select pg_sleep(5)`);},Date.now()+2000,false,controller.signal),(e:unknown)=>e instanceof TransferError&&e.code==='cancelled');clearTimeout(timer);
 assert.equal((await pool.query('select * from marker')).rowCount,0);
 const started=Date.now();await assert.rejects(transaction(async tx=>{await tx.execute(sql`select pg_sleep(5)`);},Date.now()+100),(e:unknown)=>e instanceof TransferError&&e.code==='timeout'||(e as {code:string})?.code==='57014');assert(Date.now()-started<1000);
 await transaction(async tx=>{await tx.execute(sql`insert into marker values('committed')`);},Date.now()+1000);assert.equal((await pool.query('select * from marker')).rowCount,1);
 console.info('Transfer-owned PostgreSQL connection deadline/abort closes active I/O, rolls back and does not replay writes');
} finally {await pool.end();await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await admin.end();}
