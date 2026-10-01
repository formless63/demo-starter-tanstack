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
 const limits=await transaction(async tx=>{const result=await tx.execute<{name:string;setting:string}>(sql`select name,setting from pg_settings where name in ('statement_timeout','transaction_timeout','lock_timeout')`);return Object.fromEntries(result.rows.map(row=>[row.name,Number(row.setting)]));},Date.now()+60000);assert(limits.statement_timeout<limits.transaction_timeout);assert(limits.transaction_timeout<=30000);assert(limits.lock_timeout<=5000);
 const sqlCapStarted=Date.now();await assert.rejects(transaction(async tx=>{await tx.execute(sql`insert into marker values('sql-cap-rollback')`);await tx.execute(sql`select pg_sleep(31)`);},Date.now()+60000),(error:unknown)=>error instanceof TransferError&&error.code==='timeout');assert(Date.now()-sqlCapStarted<31000);assert.equal((await pool.query("select * from marker where value='sql-cap-rollback'")).rowCount,0);
 const fatalURL=new URL(url.toString());fatalURL.searchParams.set('options','-c transaction_timeout=500ms');const fatalTransaction=createTransferTransactions(()=>fatalURL.toString(),schema);
 await assert.rejects(fatalTransaction(async tx=>{await tx.execute(sql`insert into marker values('25P04-rollback')`);await tx.execute(sql`select pg_sleep(1)`);},Date.now()+60000),(error:unknown)=>error instanceof TransferError&&error.code==='timeout');assert.equal((await pool.query("select * from marker where value='25P04-rollback'")).rowCount,0);
 await assert.rejects(fatalTransaction(async tx=>{try{await tx.execute(sql`insert into marker values('masked-timeout')`);await tx.execute(sql`select pg_sleep(1)`);}catch{throw new TransferError('unavailable');}},Date.now()+60000),(error:unknown)=>error instanceof TransferError&&error.code==='timeout');assert.equal((await pool.query("select * from marker where value='masked-timeout'")).rowCount,0);
 await assert.rejects(transaction(async tx=>{await tx.execute(sql`insert into marker values('swallowed-timeout')`);await tx.execute(sql`select set_config('statement_timeout','100ms',true)`);try{await tx.execute(sql`select pg_sleep(1)`);}catch{/* A domain adapter may hide the error; the owned driver still observed timeout. */}return 'ignored';},Date.now()+60000),(error:unknown)=>error instanceof TransferError&&error.code==='timeout');assert.equal((await pool.query("select * from marker where value='swallowed-timeout'")).rowCount,0);
 console.info('Statement timeout strictly below the30-second transaction cap preserves safe timeout/rollback with60-second attempt budget; actual25P04/rollback connection failure also remains timeout');
 console.info('Transfer-owned PostgreSQL connection deadline/abort closes active I/O, rolls back and does not replay writes');
} finally {await pool.end();await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await admin.end();}
