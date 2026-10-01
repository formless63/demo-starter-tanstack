import pg from 'pg';
import {inspectOpsJobs} from '../src/lib/ops-jobs.server';
const original=pg.Client.prototype.query;
let reads=0;
pg.Client.prototype.query=function(this: pg.Client, ...args: Parameters<typeof original>){
 const text=args[0];if(typeof text!=='string' || !/^\s*select\b/i.test(text))throw new Error('Ops attempted non-read query');
 reads++;return original.apply(this,args);
} as typeof original;
try{
 const result=await inspectOpsJobs({signal:new AbortController().signal});
 if(result.status!=='ok'||reads!==1)throw new Error('Ops Jobs metadata canary failed');
 console.info('Ops real PostgreSQL/Jobs SELECT-only metadata canary passed');
}finally{pg.Client.prototype.query=original;}

// Real supported abort must close the PostgreSQL socket and stop its in-flight query.
const {randomUUID}=await import('node:crypto');
const marker=`ops_abort_${randomUUID().replaceAll('-','')}`;
const controller=new AbortController();
let started:()=>void=()=>{};const queryStarted=new Promise<void>(resolve=>{started=resolve;});
pg.Client.prototype.query=function(this:pg.Client,...args:Parameters<typeof original>){
 started();return original.call(this,`SELECT pg_sleep(30) /* ${marker} */` as never) as never;
} as typeof original;
let inspection:Promise<unknown>|undefined;
try{
 inspection=inspectOpsJobs({signal:controller.signal});void inspection.catch(()=>{});
 await queryStarted;const before=performance.now();controller.abort();
 await inspection.then(()=>{throw new Error('Aborted I/O unexpectedly succeeded');},()=>{});
 if(performance.now()-before>1000)throw new Error('PostgreSQL abort failed to close in-flight I/O');
 pg.Client.prototype.query=original;
 const observer=new pg.Client({connectionString:process.env.DATABASE_URL});await observer.connect();
 try{
  const deadline=Date.now()+2000;let active=1;
  while(active&&Date.now()<deadline){const rows=await observer.query('SELECT count(*)::int AS active FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND query LIKE $1 AND state=\'active\'',[`%${marker}%`]);active=rows.rows[0].active;if(active)await new Promise(resolve=>setTimeout(resolve,20));}
  if(active)throw new Error('PostgreSQL work remained active after socket abort');
 }finally{await observer.end();}
 console.info('Ops abort closed actual PostgreSQL I/O and left no active fixture query');
}finally{controller.abort();pg.Client.prototype.query=original;await inspection?.catch(()=>{});}
