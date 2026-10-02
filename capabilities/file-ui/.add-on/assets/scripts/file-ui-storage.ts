import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { getFileStorage } from '../src/integrations/file-ui/storage.server';
import { createFileWorkflow } from '../src/integrations/file-ui/workflow.server';
import { createMemoryFileMetadata } from '../src/integrations/file-ui/memory.server';
const storage = getFileStorage(); const metadata = createMemoryFileMetadata();
const workflow = createFileWorkflow({ metadata, storage: () => storage, authorize: async () => true });
const ctx = { owner: `file-ui-fixture-${randomUUID()}` };
try {
 const bytes = new Uint8Array([0, 1, 2, 255]); const token = randomUUID(); const input = () => ({ token, name: 'fixture.bin', type: 'application/octet-stream', body: new Response(bytes).body, expectedSize: bytes.length, expectedDigest: createHash('sha256').update(bytes).digest('hex') });
 const row = await workflow.upload(ctx, input()); assert.equal(row.state, 'ready'); assert.equal((await workflow.upload(ctx, input())).id, row.id);
 const download = await workflow.download(ctx, row.id); assert.deepEqual(await download.body.transformToByteArray(), bytes);
 assert.equal((await workflow.remove(ctx, row.id)).state, 'removed');
 // Removing File UI integration does not delete Object Storage data. Keep a standalone marker across the lifecycle removal gate.
 if (process.env.FILE_UI_REMOVAL_MARKER) {
  const key = storage.createKey('file-ui-removal-fixture'); await storage.putObject(key, 'retained-object', { contentLength: 15 });
  await writeFile(process.env.FILE_UI_REMOVAL_MARKER, key);
 }
 console.info('File UI real provider lifecycle passed.');
} finally {
 for (const row of await metadata.list(ctx.owner, 100)) await storage.deleteObject(row.key);
 storage.close();
}
