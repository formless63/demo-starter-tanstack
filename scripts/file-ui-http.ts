// Hosted dev + production native-route proof. Only synthetic users and local S3 protocol bytes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const objects = new Map<string, { body: Buffer; type: string; hash: string }>(); let puts = 0;
const storageServer = createServer(async (req, res) => {
 const key = (req.url ?? '').split('?')[0];
 if (req.method === 'PUT') { const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); puts++; objects.set(key, { body: Buffer.concat(chunks), type: String(req.headers['content-type']), hash: String(req.headers['x-amz-meta-sha256']) }); res.writeHead(200, { etag: '"fixture"' }).end(); return; }
 if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204).end(); return; }
 const object = objects.get(key); if (!object) { res.writeHead(404).end(); return; }
 res.writeHead(200, { 'content-type': object.type, 'content-length': object.body.length, 'x-amz-meta-sha256': object.hash }).end(req.method === 'HEAD' ? undefined : object.body);
});
storageServer.listen(0, '127.0.0.1'); await once(storageServer, 'listening'); const storageAddress = storageServer.address(); assert(storageAddress && typeof storageAddress !== 'string');
async function freePort() { const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert(address && typeof address !== 'string'); await new Promise<void>(r => server.close(() => r())); return address.port; }
try {
 for (const mode of ['development', 'production'] as const) {
  const owner = `file-ui-http-${randomUUID()}`; const foreign = `file-ui-http-${randomUUID()}`; const secret = 'file-ui-http-synthetic-secret-at-least-32-characters'; const port = await freePort(); const base = `http://127.0.0.1:${port}`; let logs = '';
  const env = { ...process.env, NODE_ENV: mode, APP_BASE_URL: base, BETTER_AUTH_SECRET: secret, PORT: String(port), HOST: '127.0.0.1', STORAGE_BUCKET: 'file-ui-http-fixture', STORAGE_REGION: 'us-east-1', STORAGE_ENDPOINT: `http://127.0.0.1:${storageAddress.port}`, STORAGE_ACCESS_KEY_ID: 'fixture', STORAGE_SECRET_ACCESS_KEY: 'synthetic-fixture-only', STORAGE_KEY_PREFIX: '', REALTIME_TRANSPORTS: 'sse' };
  const child = mode === 'production' ? spawn('node', ['scripts/start.mjs'], { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }) : spawn('bun', ['x', 'vite', 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { logs = (logs + chunk).slice(-20000); }); child.stderr.on('data', chunk => { logs = (logs + chunk).slice(-20000); });
  const exit = once(child, 'exit');
  try {
   const deadline = Date.now() + 90000; let ready = false;
   while (Date.now() < deadline && child.exitCode === null) { try { ready = (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) })).ok; if (ready) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
   assert(ready, `${mode} server did not become ready: ${logs}`);
   const headersFor = async (person: string) => {
    const token = randomUUID(); await pool.query('insert into "user"(id,name,email) values($1,$1,$1||\'@example.test\')', [person]); await pool.query('insert into session(id,user_id,token,expires_at) values($1,$2,$3,now()+interval \'1 hour\')', [randomUUID(), person, token]);
    const cookie = encodeURIComponent(`${token}.${createHmac('sha256', secret).update(token).digest('base64')}`); return { cookie: `better-auth.session_token=${cookie}; __Secure-better-auth.session_token=${cookie}`, origin: base, 'x-file-ui': '1' };
   };
   const headers = await headersFor(owner); const foreignHeaders = await headersFor(foreign); const payload = Buffer.from('<html><script>not executed</script>\u0000fixture</html>'); const token = randomUUID(); const putHeaders = { ...headers, 'content-type': 'text/html', 'x-file-name': encodeURIComponent('fixture ü.html'), 'idempotency-key': token }; const before = puts;
   assert.equal((await fetch(`${base}/api/files/list`)).status, 401);
   assert.equal((await fetch(`${base}/api/files/upload`, { method: 'POST', headers: { ...putHeaders, origin: 'https://foreign.example' }, body: payload })).status, 403);
   const response = await fetch(`${base}/api/files/upload`, { method: 'POST', headers: putHeaders, body: payload }); assert.equal(response.status, 200, await response.clone().text()); const row = await response.json() as { id: string; state: string }; assert.equal(row.state, 'ready');
   const replay = await fetch(`${base}/api/files/upload`, { method: 'POST', headers: putHeaders, body: payload }); assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), row); assert.equal(puts - before, 1);
   assert.equal((await fetch(`${base}/api/files/upload`, { method: 'POST', headers: putHeaders, body: 'conflicting bytes' })).status, 409);
   const download = await fetch(`${base}/api/files/download?id=${row.id}`, { headers }); assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), payload); assert.match(download.headers.get('content-disposition') ?? '', /^attachment;/); assert.equal(download.headers.get('content-type'), 'application/octet-stream'); assert.equal(download.headers.get('x-content-type-options'), 'nosniff'); assert.match(download.headers.get('content-security-policy') ?? '', /sandbox/);
   assert.equal((await fetch(`${base}/api/files/download?id=${row.id}`, { headers: foreignHeaders })).status, 404); assert.equal((await fetch(`${base}/api/files/remove?id=${row.id}`, { method: 'POST', headers: foreignHeaders })).status, 404);
   const removed = await fetch(`${base}/api/files/remove?id=${row.id}`, { method: 'POST', headers }); assert.equal(removed.status, 200); assert.equal((await removed.json() as { state: string }).state, 'removed'); assert.equal((await fetch(`${base}/api/files/download?id=${row.id}`, { headers })).status, 404); assert.equal(objects.size, 0);
   console.info(`File UI ${mode} native HTTP: synthetic session upload/replay/conflict/attachment bytes/CSRF/owner isolation/removal passed.`);
  } finally {
   if (child.pid && child.exitCode === null) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} await Promise.race([exit, new Promise(r => setTimeout(r, 5000))]); if (child.exitCode === null) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } }
   await pool.query('delete from file_ui_files where owner=any($1)', [[owner, foreign]]); await pool.query('delete from session where user_id=any($1)', [[owner, foreign]]); await pool.query('delete from "user" where id=any($1)', [[owner, foreign]]);
  }
 }
} finally { await pool.end(); storageServer.closeAllConnections(); await new Promise<void>(r => storageServer.close(() => r())); }
