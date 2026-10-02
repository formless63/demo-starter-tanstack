// Disposable local-fixture process only; never an application authorization policy.
import assert from 'node:assert/strict';
import pg from 'pg';
import * as pgCore from 'drizzle-orm/pg-core';
import {drizzle} from 'drizzle-orm/node-postgres';
import {createJobsBoss} from '../src/integrations/jobs/boss.server';
import {createMedusa} from '../src/integrations/medusa/medusa.server';
import {createMedusaJobs} from '../src/integrations/medusa/jobs.server';
assert.ok(Object.keys(pgCore).length>0);
assert.equal(process.env.NODE_ENV,'test');const url=process.env.DATABASE_URL;if(!url||!/^\/medusa_native_[a-f0-9]+_starter$/.test(new URL(url).pathname))throw new Error('Owned native fixture database required');
const pool=new pg.Pool({connectionString:url});const db=drizzle(pool);const boss=createJobsBoss('worker');
const service=createMedusa({db,enqueue:async()=>{throw new Error('Fixture worker cannot produce.');},policy:{authorizeScope:async(actor,scope)=>scope.kind==='user'&&actor==='native-owner'&&scope.id===actor,authorizeBoundResource:async(ctx,b)=>ctx.actorUserId===b.scope_id&&b.local_resource_id.startsWith('native-'),authorizeMedusaResource:async(_ctx,b)=>b.local_resource_id.startsWith('native-'),authorizeReconciliation:async b=>b.scope_kind==='user'&&b.scope_id==='native-owner'&&b.local_resource_id.startsWith('native-')}});
const definition=createMedusaJobs(service)['medusa.reconcile'];await boss.start();await boss.createQueue('medusa.reconcile',definition.queue);await boss.work('medusa.reconcile',{includeMetadata:true,pollingIntervalSeconds:0.5},async([job])=>{if(!job)throw new Error('Empty fixture job');return definition.handler(definition.payload.parse(job.data),{id:job.id,signal:job.signal,retryCount:job.retryCount,retryLimit:job.retryLimit});});
console.info('medusa.fixture-worker.ready');
let stopping=false;async function stop(){if(stopping)return;stopping=true;await boss.stop({graceful:true,timeout:5000});await pool.end();process.exitCode=0;}
process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
