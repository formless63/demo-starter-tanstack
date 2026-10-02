import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {readFile,rm,writeFile} from "node:fs/promises";
import pg from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
const cta=JSON.parse(await readFile(".cta.json","utf8"));assert.equal(cta.projectName,"stripe-addon-clean-install");assert.ok(process.env.DATABASE_URL);
const admin=new pg.Pool({connectionString:process.env.DATABASE_URL});const name=`stripe_addon_${randomUUID().replaceAll("-","")}`;const url=new URL(process.env.DATABASE_URL);url.pathname=`/${name}`;const pool=new pg.Pool({connectionString:url.toString()});
function run(command:string,args:string[]){const result=spawnSync(command,args,{stdio:"inherit",env:{...process.env,DATABASE_URL:url.toString(),PGBOSS_DATABASE_URL:url.toString(),STRIPE_FIXTURE_DATABASE_URL:url.toString()}});assert.equal(result.status,0,`${command} ${args.join(" ")}`);}
try {
 await admin.query(`CREATE DATABASE "${name}"`);await migrate(drizzle(pool),{migrationsFolder:"drizzle"});await migrate(drizzle(pool),{migrationsFolder:"drizzle"});
 run("bun",["run","jobs:migrate"]);run("bun",["run","jobs:doctor"]);run("bun",["scripts/stripe-unit.ts"]);run("bun",["scripts/stripe-durable-fixture.ts"]);
 run("bun",["build","scripts/stripe-unit.ts","--target=node","--outfile=stripe-unit.mjs"]);run("node",["--unhandled-rejections=strict","stripe-unit.mjs"]);
 run("bun",["build","scripts/stripe-durable-fixture.ts","--target=node","--outfile=stripe-durable.mjs"]);run("node",["--unhandled-rejections=strict","stripe-durable.mjs"]);run("bun",["x","tsc","--noEmit"]);run("bun",["run","build"]);
 const retained=randomUUID();await pool.query("insert into stripe_binding(id,scope_kind,scope_id,local_resource_id,connection_id,resource_kind,remote_id,created_at) values ($1,'user','fixture','retained','default','customer','cus_retained',now())",[retained]);
 // Disposable fixture has no worker; stop processing before unregistering. Retain all financial history.
 await pool.query("delete from pgboss.job where name='stripe.process'");
 for(const file of ["jobs.server.ts","service.server.ts","transport.server.ts","webhook.server.ts","config.server.ts","projection.ts","stripe.test.ts"])await rm(`src/integrations/stripe/${file}`);
 await rm("src/lib/stripe.server.ts");await rm("src/routes/api/integrations/stripe",{recursive:true,force:true});
 const registry=await readFile("src/integrations/jobs/registry.ts","utf8");await writeFile("src/integrations/jobs/registry.ts",registry.split("\n").filter(line=>!line.includes("referenceStripeJobs")).join("\n"));
 for(const script of ["stripe-unit.ts","stripe-durable-fixture.ts"])await rm(`scripts/${script}`);
 await rm("stripe-unit.mjs");await rm("stripe-durable.mjs");
 const pkg=JSON.parse(await readFile("package.json","utf8"));delete pkg.dependencies.stripe;for(const key of Object.keys(pkg.scripts))if(key.startsWith("stripe:"))delete pkg.scripts[key];await writeFile("package.json",JSON.stringify(pkg,null,2)+"\n");
 run("bun",["x","tsc","--noEmit"]);run("bun",["run","jobs:doctor"]);run("bun",["run","jobs:smoke"]);run("bun",["run","build"]);
 assert.equal((await pool.query("select id from stripe_binding where id=$1",[retained])).rowCount,1);assert.ok(await readFile("drizzle/0011_stripe_v1.sql","utf8"));assert.ok(await readFile("src/integrations/stripe/schema.ts","utf8"));assert.equal((await pool.query("select * from drizzle.__drizzle_migrations")).rowCount,1);
 console.info("Stripe independent removal/rebuild retains bindings/history/schema/migrations, Jobs and Webhooks; no remote deletion.");
} finally {await pool.end();await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await admin.end();}
