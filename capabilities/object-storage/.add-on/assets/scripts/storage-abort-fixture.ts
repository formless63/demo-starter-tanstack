import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { Readable } from 'node:stream';
import { createStorage } from '../src/integrations/storage/storage.server';
import { storageConfig } from '../src/integrations/storage/config.server';
import { StorageError } from '../src/integrations/storage/errors.server';
let requests = 0;
let acquired: (() => void) | undefined;
let streaming = false;
const server = createServer((request, response) => {
 requests++;
 request.resume();
 if (streaming) { response.writeHead(200, { 'Content-Length': '1048576' }); response.write('a'); }
 acquired?.();
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert(address && typeof address !== 'string');
const storage = createStorage(storageConfig({ STORAGE_BUCKET: 'test-bucket', STORAGE_REGION: 'us-east-1', STORAGE_ENDPOINT: `http://127.0.0.1:${address.port}`, STORAGE_ACCESS_KEY_ID: 'fixture', STORAGE_SECRET_ACCESS_KEY: 'fixture-only' }));
const cancelled = (e: unknown) => e instanceof StorageError && e.code === 'cancelled';
try {
 const pre = AbortSignal.abort();
 await assert.rejects(storage.getObject('test/key', { signal: pre }), cancelled);
 await assert.rejects(storage.headObject('test/key', { signal: pre }), cancelled);
 await assert.rejects(storage.putObject('test/key', 'body', { signal: pre }), cancelled);
 assert.equal(requests, 0);
 for (const operation of ['get', 'put', 'head'] as const) {
  const controller = new AbortController();
  const reached = new Promise<void>(resolve => { acquired = resolve; });
  const work = operation === 'get' ? storage.getObject('test/key', { signal: controller.signal }) : operation === 'head' ? storage.headObject('test/key', { signal: controller.signal }) : storage.putObject('test/key', 'body', { contentLength: 4, signal: controller.signal });
  const check = assert.rejects(work, cancelled);
  await reached; controller.abort(); await check;
 }
 streaming = true;
 const controller = new AbortController();
 const { body } = await storage.getObject('test/key', { signal: controller.signal });
 assert(body);
 const stream = body as Readable;
 const error = once(stream, 'error');
 controller.abort();
 assert(cancelled((await error)[0]));
 assert(stream.destroyed);
 console.info('Storage cancellation: preabort, GET acquisition/body, PUT, HEAD passed');
} finally { storage.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
