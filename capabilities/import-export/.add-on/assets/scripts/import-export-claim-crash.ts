// Disposable crash fixture. Supported fetch ignores scheduled time only to exercise native attempts without waiting through backoff.
import assert from 'node:assert/strict';
import { PgBoss } from 'pg-boss';
const boss=new PgBoss({connectionString:process.env.DATABASE_URL,migrate:false,supervise:false,schedule:false});
await boss.start();
const [job]=await boss.fetch('import-export.run',{includeMetadata:true,ignoreStartAfter:true,batchSize:1});
assert.equal(job?.id,process.env.IMPORT_EXPORT_FIXTURE_JOB_ID);
console.info('fixture.native_claim_ready');
await new Promise<never>(()=>{});
