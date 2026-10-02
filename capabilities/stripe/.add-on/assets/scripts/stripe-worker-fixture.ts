import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {resolve} from "node:path";
import pg from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {PgBoss} from "pg-boss";
const adminUrl=process.env.STRIPE_FIXTURE_DATABASE_URL??process.env.DATABASE_URL;assert.ok(adminUrl);assert.ok(process.env.STRIPE_WORKER_SCRIPT,"Explicit existing standalone Jobs worker bundle required");
const admin=new pg.Pool({connectionString:adminUrl});const name=`stripe_worker_${randomUUID().replaceAll("-","")}`;const url=new URL(adminUrl);url.pathname=`/${name}`;const pool=new pg.Pool({connectionString:url.toString()});const boss=new PgBoss({connectionString:url.toString(),migrate:true});
let worker:ReturnType<typeof spawn>|undefined;let logs="";let exitCode:number|null|undefined;
try {
 await admin.query(`CREATE DATABASE "${name}"`);await migrate(drizzle(pool),{migrationsFolder:"drizzle"});await boss.start();await boss.createQueue("stripe.process",{retryLimit:5,retryDelay:30,retryBackoff:true,retryDelayMax:900,expireInSeconds:45});
 const actor=`stripe-worker-${randomUUID()}`;const binding=randomUUID();const operation=randomUUID();
 if(process.env.STRIPE_FIXTURE_POLICY!=="denied")await pool.query('insert into "user"(id,name,email) values($1,$1,$1||\'@example.test\')',[actor]);await pool.query("insert into stripe_binding(id,scope_kind,scope_id,local_resource_id,connection_id,resource_kind,remote_id,created_at) values ($1,'user',$2,'worker-customer','default','customer','cus_worker_private',now())",[binding,actor]);
 await pool.query("insert into stripe_operation(id,scope_kind,scope_id,actor_user_id,connection_id,kind,caller_key,digest,source_binding_id,status,created_at,updated_at) values ($1,'user',$2,$2,'default','create_checkout','worker-fixture',$3,$4,'queued',now(),now())",[operation,actor,"a".repeat(64),binding]);
 const jobId=await boss.send("stripe.process",{operationId:operation});assert.ok(jobId);
 const env={...process.env,DATABASE_URL:url.toString(),PGBOSS_DATABASE_URL:url.toString(),BETTER_AUTH_SECRET:"local-worker-fixture-with-at-least-32-characters",APP_BASE_URL:"http://127.0.0.1:3000",NODE_ENV:"production"};for(const key of Object.keys(env))if(key.startsWith("STRIPE_"))delete env[key as keyof typeof env];
 worker=spawn(process.env.STRIPE_WORKER_RUNTIME??"node",["--unhandled-rejections=strict",resolve(process.env.STRIPE_WORKER_SCRIPT)],{env,stdio:["ignore","pipe","pipe"]});worker.on("exit",code=>{exitCode=code;});worker.on("error",()=>{exitCode=1;});for(const stream of [worker.stdout,worker.stderr])stream?.on("data",chunk=>{logs+=String(chunk);assert.ok(Buffer.byteLength(logs)<=128*1024);});
 const until=Date.now()+30_000;let completed=false;
 while(Date.now()<until){assert.equal(exitCode,undefined,"Standalone worker exited before consumption");const job=await boss.getJobById("stripe.process",jobId);if(job?.state==="completed"){assert.deepEqual(job.output,{status:"ignored",errorCode:process.env.STRIPE_FIXTURE_POLICY==="denied"?"forbidden":"unconfigured"});completed=true;break;}await new Promise(resolve=>setTimeout(resolve,100));}
 assert.ok(completed,"Standalone worker did not consume within fixture deadline");assert.equal((await pool.query("select status,error_code,first_dispatch_at from stripe_operation where id=$1",[operation])).rows[0].status,"failed");assert.ok(logs.includes("stripe.process"));assert.ok(!logs.includes("cus_worker_private"));assert.ok(!logs.includes("sk_test"));
 console.info("Actual standalone production Node Jobs worker registered/consumed Stripe with missing configuration, safe output/logs and no provider transport.");
} finally {if(worker&&exitCode===undefined){worker.kill("SIGTERM");await Promise.race([new Promise(resolve=>worker?.once("exit",resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);if(exitCode===undefined)worker.kill("SIGKILL");}await boss.stop({graceful:true});await pool.end();await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await admin.end();}
