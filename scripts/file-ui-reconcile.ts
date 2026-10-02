import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });
const [owner, id, assertion] = process.argv.slice(2);
if (!owner || !id || ![undefined, '--writers-stopped'].includes(assertion)) throw Error('Usage: bun scripts/file-ui-reconcile.ts <owner> <file-id> [--writers-stopped]. Stop/fence EVERY prior writer before asserting; lease age is not proof.');
const { referenceFiles } = await import('../src/lib/file-ui.server');
const result = await referenceFiles.reconcile({ owner }, id, { writersStopped: assertion === '--writers-stopped' });
console.info(JSON.stringify({ state: result.state }));
process.exit(0);
