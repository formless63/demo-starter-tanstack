import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {createServer} from "node:http";
import {eq,sql} from "drizzle-orm";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import {PgBoss,fromDrizzle} from "pg-boss";
import * as schema from "../src/db/schema";
import {createStripeCapability,type StripeWiring} from "../src/integrations/stripe/service.server";
import {createStripeJobs} from "../src/integrations/stripe/jobs.server";
import {stripeBindings,stripeInbox,stripeOperations,stripeProjections} from "../src/integrations/stripe/schema";
import {StripeCapabilityError} from "../src/integrations/stripe/contract";
const adminUrl=process.env.STRIPE_FIXTURE_DATABASE_URL??process.env.DATABASE_URL;
assert.ok(adminUrl,"Explicit disposable fixture PostgreSQL URL required");
const admin=new pg.Pool({connectionString:adminUrl});const name=`stripe_fixture_${randomUUID().replaceAll("-","")}`;const url=new URL(adminUrl);url.pathname=`/${name}`;
const pool=new pg.Pool({connectionString:url.toString()});const db=drizzle(pool,{schema});const boss=new PgBoss({connectionString:url.toString(),migrate:true});
let allow=true;let callbackAllow=true;let outcome="normal";let posts=0;let gets=0;let paymentStatus="unpaid";
const bodies:string[]=[];const keys:(string|string[]|undefined)[]=[];
const server=createServer((req,res)=>{let body="";req.on("data",v=>body+=v);req.on("end",()=>{
 res.setHeader("content-type","application/json");if(req.method==="POST"){posts++;bodies.push(body);keys.push(req.headers["idempotency-key"]);if(outcome==="disconnect"){req.socket.destroy();return;}}
 else gets++;
 if(req.url?.startsWith("/v1/payment_intents/")){res.end(JSON.stringify({id:"pi_fixture",object:"payment_intent",livemode:false,status:"succeeded",currency:"usd",amount:2500,amount_received:2500,metadata:{private:"do-not-expose"}}));return;}
 res.end(JSON.stringify({id:"cs_fixture",object:"checkout.session",livemode:false,customer:"cus_fixture",status:"complete",payment_status:paymentStatus,currency:"usd",amount_total:2500,url:"https://checkout.stripe.com/private",payment_intent:"pi_fixture",customer_details:{email:"private@example.test"},metadata:{owner:"forged"}}));
});});
await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();assert.ok(address&&typeof address!=="string");
const config={id:"default",secretKey:"sk_test_fixture",accountId:"acct_fixture",mode:"test" as const,webhookSecrets:["whsec_fixture"],endpoint:`http://127.0.0.1:${address.port}/`};
const scopeA={actorUserId:"scope-a",scope:{kind:"user" as const,id:"scope-a"}};const scopeB={actorUserId:"scope-b",scope:{kind:"user" as const,id:"scope-b"}};
const wiring:StripeWiring={db,async enqueue(tx,payload){const job=await boss.send("stripe.process",payload,{db:fromDrizzle(tx,sql)});assert.ok(job);},async resolveConnection(){return config;},async authorizeScope(actor,scope){return allow&&scope.kind==="user"&&scope.id===actor;},async authorizeBoundResource(context,binding){return allow&&context.scope.id===binding.scopeId;},async authorizeReconciliation(){return callbackAllow;},async resolveOffer(){return {priceId:"price_fixture",currency:"usd"};},async approvedRedirects(){return {successUrl:"https://app.example/success",cancelUrl:"https://app.example/cancel"};}};
const service=createStripeCapability(wiring);const worker=createStripeJobs(wiring);const context={id:randomUUID(),signal:new AbortController().signal,retryCount:5,retryLimit:5};
async function processOperation(operationId:string){return worker.jobs["stripe.process"].handler({operationId},context);}
try {
 await admin.query(`CREATE DATABASE "${name}"`);await migrate(db,{migrationsFolder:"drizzle"});await migrate(db,{migrationsFolder:"drizzle"});await boss.start();await boss.createQueue("stripe.process",worker.jobs["stripe.process"].queue);
 const binding=await db.transaction(tx=>service.createBindingInTransaction(tx,scopeA,{localResourceId:"customer-a",connectionId:"default",resourceKind:"customer",remoteId:"cus_fixture"}));
 await assert.rejects(service.requestCheckout(scopeB,{customerBindingId:binding.id,idempotencyKey:"key",items:[{offerId:"standard",quantity:1}]}),e=>e instanceof StripeCapabilityError&&e.code==="not_found");assert.equal(posts,0);
 const queued=await service.requestCheckout(scopeA,{customerBindingId:binding.id,idempotencyKey:"first",items:[{offerId:"standard",quantity:1}]});assert.ok("operationId" in queued);const op=queued.operationId;
 await assert.rejects(service.requestCheckout(scopeA,{customerBindingId:binding.id,idempotencyKey:"first",items:[{offerId:"standard",quantity:2}]}),e=>e instanceof StripeCapabilityError&&e.code==="conflict");
 await processOperation(op);assert.equal(posts,1);const result=await service.getOperation(scopeA,{operationId:op});assert.equal(result.status,"succeeded");assert.ok(result.bindingId);
 const checkout=await service.getCheckout(scopeA,{bindingId:result.bindingId});assert.equal(checkout.status,"complete");assert.equal(checkout.paymentStatus,"unpaid");assert.equal(checkout.checkoutUrl,null);assert.ok(!JSON.stringify(checkout).includes("private"));
 await assert.rejects(service.getCheckout(scopeB,{bindingId:result.bindingId}));
 const duplicate=await service.requestCheckout(scopeA,{customerBindingId:binding.id,idempotencyKey:"first",items:[{offerId:"standard",quantity:1}]});assert.ok("status" in duplicate);assert.equal(duplicate.status,"succeeded");assert.equal(posts,1);
 const hints={eventId:"evt_first",type:"checkout.session.completed" as const,kind:"checkout" as const,remoteId:"cs_fixture",bodySHA256:"a".repeat(64)};
 const before=(await pool.query("select count(*)::int as count from pgboss.job")).rows[0].count;
 await assert.rejects(db.transaction(async tx=>{await service.receiveInTransaction(tx,config,hints);throw Error("rollback");}));assert.equal((await db.select().from(stripeInbox)).length,0);assert.equal((await pool.query("select count(*)::int as count from pgboss.job")).rows[0].count,before);
 await db.transaction(tx=>service.receiveInTransaction(tx,config,hints));await db.transaction(tx=>service.receiveInTransaction(tx,config,{...hints,bodySHA256:"b".repeat(64)}));const receipts=await db.select().from(stripeInbox);assert.equal(receipts.length,1);assert.equal(receipts[0].bodySHA256,hints.bodySHA256);
 paymentStatus="paid";await worker.jobs["stripe.process"].handler({inboxId:receipts[0].id},context);assert.equal((await service.getCheckout(scopeA,{bindingId:result.bindingId})).paymentStatus,"paid");
 paymentStatus="unpaid";await db.transaction(tx=>service.receiveInTransaction(tx,config,{...hints,eventId:"evt_outoforder",type:"checkout.session.async_payment_failed"}));const [later]=await db.select().from(stripeInbox).where(eq(stripeInbox.eventId,"evt_outoforder"));await worker.jobs["stripe.process"].handler({inboxId:later.id},context);assert.equal((await service.getCheckout(scopeA,{bindingId:result.bindingId})).paymentStatus,"unpaid");
 await db.transaction(tx=>service.receiveInTransaction(tx,config,{...hints,eventId:"evt_unbound",remoteId:"cs_forged"}));const [ignored]=await db.select().from(stripeInbox).where(eq(stripeInbox.eventId,"evt_unbound"));assert.equal(ignored.state,"ignored");
 const [payment]=await db.select().from(stripeBindings).where(eq(stripeBindings.resourceKind,"payment"));assert.ok(payment);
 const reconciliation=await service.requestPaymentReconciliation(scopeA,{kind:"payment",bindingId:payment.id});await processOperation(reconciliation.operationId);const listed=await service.listPayments(scopeA,{});assert.equal(listed.items[0].status,"succeeded");assert.equal((await service.listPayments(scopeB,{})).items.length,0);assert.ok(!JSON.stringify(listed).includes("private"));
 outcome="disconnect";const ambiguous=await service.requestCheckout(scopeA,{customerBindingId:binding.id,idempotencyKey:"ambiguous",items:[{offerId:"standard",quantity:1}]});assert.ok("operationId" in ambiguous);await processOperation(ambiguous.operationId);assert.equal((await service.getOperation(scopeA,{operationId:ambiguous.operationId})).status,"reconciliation_required");const count=posts;await processOperation(ambiguous.operationId);assert.equal(posts,count);
 outcome="normal";const revoked=await service.requestPaymentReconciliation(scopeA,{kind:"payment",bindingId:payment.id});allow=false;const getCount=gets;await processOperation(revoked.operationId);assert.equal(gets,getCount);allow=true;
 const stale=await service.requestCheckout(scopeA,{customerBindingId:binding.id,idempotencyKey:"cutoff",items:[{offerId:"standard",quantity:1}]});assert.ok("operationId" in stale);await db.update(stripeOperations).set({firstDispatchAt:new Date(Date.now()-23*3600*1000)}).where(eq(stripeOperations.id,stale.operationId));await processOperation(stale.operationId);assert.equal(posts,count);
 const queue=await pool.query("select data from pgboss.job");for(const row of queue.rows){const fields=Object.keys(row.data);assert.equal(fields.length,1);assert.ok(fields[0]==="operationId"||fields[0]==="inboxId");assert.ok(!JSON.stringify(row.data).includes("private"));}
 const sqlFiles=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8")).entries;assert.equal(sqlFiles.length>=1,true);assert.ok(await readFile("drizzle/0011_stripe_v1.sql","utf8"));
 assert.ok((await db.select().from(stripeProjections)).length>=2);assert.equal(keys[0],`gs-stripe:${op}`);assert.ok(new URLSearchParams(bodies[0]).get("automatic_tax[enabled]") === "false");
 console.info("Stripe disposable PostgreSQL18 ownership/ledger/receipt rollback/privacy/cutoff fixtures passed; no provider API requests.");
} finally {await boss.stop({graceful:true});server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await admin.end();}
