import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createTlsServer } from "node:tls";
import { createCache } from "../src/integrations/cache/cache.server";
import { spawnSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { docker } from "./cache-dev";

const server = createServer();
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("No disposable test port");
await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
const project = `cache-compat-${randomUUID().slice(0, 8)}`;
const compose = ["compose", "-f", "compose.cache.yaml", "-p", project];
const overrides = { CACHE_DEV_PORT: String(address.port) };
try {
	docker([...compose, "up", "-d", "--wait", "--wait-timeout", "45"], overrides);
	const child = spawn(process.execPath, ["scripts/cache-smoke.ts"], {
		env: { ...process.env, CACHE_URL: `redis://127.0.0.1:${address.port}`, CACHE_DEFAULT_TTL_SECONDS: "300", CACHE_MAX_VALUE_BYTES: "1048576", CACHE_COMPAT_PROJECT: project },
		stdio: "inherit",
	});
	const status = await new Promise<number>((resolve, reject) => { child.once("error", reject); child.once("exit", (code) => resolve(code ?? 1)); });
	if (status !== 0) throw new Error("Cache compatibility contract failed");
	// Production Node 24 runs the same exact contract when explicitly supplied.
	if (process.env.CACHE_COMPAT_NODE_SCRIPT) {
		const node = spawn("node", [process.env.CACHE_COMPAT_NODE_SCRIPT], { env: { ...process.env, CACHE_URL: `redis://127.0.0.1:${address.port}` }, stdio: "inherit" });
		const nodeStatus = await new Promise<number>((resolve, reject) => { node.once("error", reject); node.once("exit", (code) => resolve(code ?? 1)); });
		if (nodeStatus !== 0) throw new Error("Node cache contract failed");
	}
	const certificateDirectory = mkdtempSync(join(tmpdir(), "cache-tls-"));
 const key = join(certificateDirectory, "key.pem"), cert = join(certificateDirectory, "cert.pem");
 let tlsServer: ReturnType<typeof createTlsServer> | undefined;
 try {
 assert.equal(spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" }).status, 0);
 tlsServer = createTlsServer({ key: readFileSync(key), cert: readFileSync(cert) });
 tlsServer.on("tlsClientError", () => {});
 await new Promise<void>(resolve => tlsServer!.listen(0, "127.0.0.1", resolve));
 const address = tlsServer.address(); assert.ok(address && typeof address !== "string");
 const cache = createCache({ env: { CACHE_URL: `rediss://127.0.0.1:${address.port}` } });
 try { await assert.rejects(cache.checkCache()); } finally { await cache.close(); }
 } finally {
 if (tlsServer) await new Promise<void>(resolve => tlsServer!.close(() => resolve()));
 rmSync(certificateDirectory, { recursive: true, force: true });
 }
	console.info("Actual Valkey compatibility contract passed");
} finally { docker([...compose, "down", "--volumes", "--remove-orphans"], overrides); }
