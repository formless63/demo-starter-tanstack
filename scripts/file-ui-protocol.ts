import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createFileStorage } from '../src/integrations/file-ui/storage.server';
import { storageConfig } from '../src/integrations/storage/config.server';
import { createFileWorkflow } from '../src/integrations/file-ui/workflow.server';
import { createMemoryFileMetadata } from '../src/integrations/file-ui/memory.server';
const objects = new Map<string, { body: Buffer; type: string; hash: string }>(); let puts = 0; let dropPutResponse = false; let lateWriter: Promise<void> | undefined;
const server = createServer(async (req, res) => {
 const key = (req.url ?? '').split('?')[0];
 if (req.method === 'PUT') {
  const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const stored = { body: Buffer.concat(chunks), type: String(req.headers['content-type']), hash: String(req.headers['x-amz-meta-sha256']) }; puts++;
  if (dropPutResponse) { dropPutResponse = false; lateWriter = new Promise(resolve => { setTimeout(() => { objects.set(key, stored); resolve(); }, 150); }); res.destroy(); return; }
  objects.set(key, stored);
  res.writeHead(200, { etag: '"fixture"' }); res.end(); return;
 }
 if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); res.end(); return; }
 const object = objects.get(key);
 if (!object) { res.writeHead(404); res.end(); return; }
 res.writeHead(200, { 'content-type': object.type, 'content-length': object.body.length, 'x-amz-meta-sha256': object.hash }); res.end(req.method === 'HEAD' ? undefined : object.body);
});
server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert(address && typeof address !== 'string');
const storage = createFileStorage(storageConfig({ STORAGE_BUCKET: 'file-ui-fixture', STORAGE_REGION: 'us-east-1', STORAGE_ENDPOINT: `http://127.0.0.1:${address.port}`, STORAGE_ACCESS_KEY_ID: 'fixture', STORAGE_SECRET_ACCESS_KEY: 'fixture-only-no-production' }));
try {
 const workflow = createFileWorkflow({ metadata: createMemoryFileMetadata(), storage: () => storage, authorize: async () => true });
 const ctx = { owner: 'synthetic-alice' }; const input = () => ({ token: 'file-ui-protocol-0001', name: 'safe.html', type: 'text/html', body: new Response('<script>bad()</script>').body });
 const first = await workflow.upload(ctx, input()); assert.equal(first.state, 'ready'); assert.deepEqual(await workflow.upload(ctx, input()), first); assert.equal(puts, 1);
 const download = await workflow.download(ctx, first.id); assert.equal(await download.body.transformToString(), '<script>bad()</script>'); assert.match(download.headers['Content-Disposition'], /^attachment/); assert.equal(download.headers['Content-Type'], 'application/octet-stream');
 assert.equal((await workflow.remove(ctx, first.id)).state, 'removed'); assert.equal(objects.size, 0);
 // A reset after ingest must NOT trigger an SDK retry; a delayed provider write remains quarantined.
 dropPutResponse = true; const before = puts;
 const uncertain = await workflow.upload(ctx, { ...input(), token: 'file-ui-protocol-0002' });
 assert.equal(uncertain.state, 'cleanup-pending'); assert.equal(puts - before, 1);
 assert.equal((await workflow.remove(ctx, uncertain.id)).state, 'cleanup-pending');
 await lateWriter; assert.equal(objects.size, 1);
 assert.equal((await workflow.reconcile(ctx, uncertain.id, { writersStopped: false })).state, 'cleanup-pending');
 assert.equal((await workflow.reconcile(ctx, uncertain.id, { writersStopped: true })).state, 'removed'); assert.equal(objects.size, 0);
 console.info('File UI actual S3 SDK/local HTTP upload/head/readback/download/replay/delete passed.');
} finally { storage.close(); server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
