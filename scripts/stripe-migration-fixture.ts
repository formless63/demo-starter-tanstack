import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {mkdtemp,readFile,rm,mkdir,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
const baseline=JSON.parse(await readFile("fixtures/stripe-baseline-migrations.json","utf8"));const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));
assert.deepEqual(journal.entries.slice(0,8),baseline.entries);assert.equal(journal.entries[8].tag,"0011_stripe_v1");
for(const entry of baseline.entries){const bytes=await readFile(`drizzle/${entry.tag}.sql`);assert.equal(createHash("sha256").update(bytes).digest("hex"),baseline.hashes[entry.tag]);}
const adminUrl=process.env.STRIPE_FIXTURE_DATABASE_URL??process.env.DATABASE_URL;assert.ok(adminUrl);const admin=new pg.Pool({connectionString:adminUrl});
try {
 for(const count of [6,8]) {
  const name=`stripe_upgrade_${randomUUID().replaceAll("-","")}`;const url:URL=new URL(adminUrl);url.pathname=`/${name}`;const pool:pg.Pool=new pg.Pool({connectionString:url.toString()});const folder=await mkdtemp(join(tmpdir(),"stripe-migrations-"));
  try {
   await mkdir(join(folder,"meta"));for(const entry of baseline.entries.slice(0,count))await writeFile(join(folder,`${entry.tag}.sql`),await readFile(`drizzle/${entry.tag}.sql`));await writeFile(join(folder,"meta/_journal.json"),JSON.stringify({...journal,entries:baseline.entries.slice(0,count)}));
   await admin.query(`CREATE DATABASE "${name}"`);const db=drizzle(pool);await migrate(db,{migrationsFolder:folder});
   const owner=`stripe-upgrade-${randomUUID()}`;const project=randomUUID();await pool.query('insert into "user"(id,name,email) values ($1,$1,$1||\'@example.test\')',[owner]);await pool.query("insert into project(id,name,owner_id) values ($1,'Retained upgrade fixture',$2)",[project,owner]);
   const before:Array<{hash:string;created_at:string}>=(await pool.query<{hash:string;created_at:string}>("select hash,created_at from drizzle.__drizzle_migrations order by id")).rows;
   await migrate(db,{migrationsFolder:"drizzle"});await migrate(db,{migrationsFolder:"drizzle"});const after=(await pool.query("select hash,created_at from drizzle.__drizzle_migrations order by id")).rows;assert.deepEqual(after.slice(0,count),before);assert.equal(after.length,9);assert.equal((await pool.query("select name from project where id=$1",[project])).rows[0].name,"Retained upgrade fixture");
   for(const table of ["stripe_binding","stripe_projection","stripe_operation","stripe_inbox"])assert.equal((await pool.query("select tablename from pg_tables where tablename=$1",[table])).rowCount,1);
   const id=randomUUID();await pool.query("insert into stripe_binding(id,scope_kind,scope_id,local_resource_id,connection_id,resource_kind,remote_id,created_at) values ($1,'user',$2,'customer','default','customer','cus_unique',now())",[id,owner]);await assert.rejects(pool.query("insert into stripe_binding(id,scope_kind,scope_id,local_resource_id,connection_id,resource_kind,remote_id,created_at) values ($1,'user','foreign','other','default','customer','cus_unique',now())",[randomUUID()]),(e:unknown)=>e!==null&&typeof e==="object"&&"code" in e&&e.code==="23505");
  }finally{await pool.end();await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await rm(folder,{recursive:true,force:true});}
 }
 console.info("Stripe upgrade from pre-Import and frozen Import/Ops histories passed; eight applied SQL hashes/journal entries preserved, repeat no-op and data/constraints retained.");
} finally{await admin.end();}
