import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { getStorage } from '../src/integrations/storage/storage.server';
const storage = getStorage(); const key = storage.createKey('file-ui-retained-data');
try {
 await storage.putObject(key, 'retained-data', { contentLength: 13 });
 await rm('src/components/file-ui.tsx', { force: true }); await rm('src/integrations/file-ui', { recursive: true, force: true });
 const object = await storage.getObject(key); assert(object.body); assert.equal(await object.body.transformToString(), 'retained-data');
 console.info('Object Storage read remains functional after File UI removal.');
} finally { await storage.deleteObject(key); storage.close(); }
