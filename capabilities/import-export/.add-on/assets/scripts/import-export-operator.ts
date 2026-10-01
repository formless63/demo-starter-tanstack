import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { transfers } from '../src/integrations/import-export/schema';
import { applicationTransfers } from '../src/lib/import-export.server';
import { stopJobsClient } from '../src/integrations/jobs/client.server';
const [operation,...args]=process.argv.slice(2);const execute=args.includes('--execute');const ids=args.filter(arg=>arg!=='--execute');
try {
 if(operation==='purge')console.info(JSON.stringify(await applicationTransfers.purgeTransferArtifacts(ids,{execute})));
 else if(operation==='reconcile' && ids.length>0 && ids.length<=100) {
  const result=[];for(const id of ids){const [row]=await db.select().from(transfers).where(eq(transfers.id,id));if(!row)throw new Error('Transfer was not found');result.push(await applicationTransfers.reconcileTransfer({requesterId:row.requesterId,scope:{kind:row.scopeKind,id:row.scopeId}},id));}console.info(JSON.stringify(result));
 } else throw new Error('Usage: import-export-operator.ts reconcile <ids> | purge <ids> [--execute]');
} catch { console.error('Transfer operator command failed');process.exitCode=1; }
finally {await stopJobsClient();await db.$client.end();}
