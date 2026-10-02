import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
const before=await readFile('src/integrations/jobs/registry.ts','utf8');
// The current foundation has no handlers/routes/schema registration; removing it must leave dependencies untouched.
await rm('src/integrations/invoice-ninja',{recursive:true,force:true});
assert.equal(await readFile('src/integrations/jobs/registry.ts','utf8'),before);
await rm('capabilities/invoice-ninja',{recursive:true,force:true});
console.info('Invoice Ninja boundary foundation removed; Jobs/Webhooks retained. Durable capability removal remains unverified.');
