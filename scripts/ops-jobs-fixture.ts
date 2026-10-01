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
