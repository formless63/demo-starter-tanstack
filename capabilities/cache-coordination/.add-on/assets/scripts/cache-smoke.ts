import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { createClient } from "redis";
import { createCache, CacheError, cacheError, type CacheSignal } from "../src/integrations/cache/cache.server";
import { docker } from "./cache-dev";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function eventually(check: () => Promise<boolean>, timeout = 5000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) { if (await check()) return; await sleep(50); }
	throw new Error("Cache contract condition did not become true");
}
function code(expected: string) { return (error: unknown) => error instanceof CacheError && error.code === expected; }
const prefix = `cache-test-${randomUUID()}:`;
const signals: CacheSignal[] = [];
const env = { ...process.env, CACHE_KEY_PREFIX: prefix };
const cache = createCache({ env, observe: (signal) => { signals.push(signal); } });
const peer = createCache({ env });
const brokenObserver = createCache({ env, observe: async () => { throw new Error("Observer failure"); } });
const timeoutCache = createCache({ env: { ...env, CACHE_COMMAND_TIMEOUT_MS: "100" } });
const tiny = createCache({ env: { ...env, CACHE_MAX_VALUE_BYTES: "8" } });
// Test-only inspector, never a public cache API. Only unique own keys inspected.
const inspector = createClient({ url: process.env.CACHE_URL, socket: { connectTimeout: 3000, reconnectStrategy: false } });
inspector.on("error", () => {});
const dataKeys = ["bound", "empty","string", "bytes", "ttl", "nx", "counter", "counter-ttl", "persistent", "counter-persistent", "overflow", "wrong-type"];
let subscription: Awaited<ReturnType<typeof cache.subscribe>> | undefined;
let lease: Awaited<ReturnType<typeof cache.acquireLease>> = null;
let stage = "connect";
try {
	await inspector.connect();
	await cache.checkCache();
	await brokenObserver.checkCache();
	await cache.set("empty", "");
	assert.equal(await cache.get("empty"), "");
	await tiny.set("bound", "12345678");
	assert.equal(await tiny.get("bound"), "12345678");
	await assert.rejects(tiny.set("bound", "é".repeat(5)), code("invalid_input"));
	assert.equal(await cache.get("string"), null);
	assert.equal(await cache.set("string", "hello"), true);
	assert.equal(await peer.get("string"), "hello");
	assert.ok((await inspector.ttl(`${prefix}data:string`)) > 0);
	assert.equal(await cache.delete("string"), true);
	assert.equal(await cache.delete("string"), false);
	assert.equal(await cache.get("string"), null);
	await cache.set("bytes", new Uint8Array([0, 255, 127]));
	assert.deepEqual(await cache.getBytes("bytes"), Buffer.from([0, 255, 127]));
	await cache.set("ttl", "gone", { ttlSeconds: 1 });
	await eventually(async () => await cache.get("ttl") === null);
	assert.equal(await cache.set("nx", "first", { ifAbsent: true }), true);
	assert.equal(await peer.set("nx", "second", { ifAbsent: true }), false);
	assert.equal(await cache.get("nx"), "first");
	await assert.rejects(tiny.set("string", "123456789"), code("invalid_input"));
	assert.equal(await cache.get("string"), null);
	for (const key of ["", "bad\nkey", "bad\u0000key", "a".repeat(257), "*", " space"]) await assert.rejects(cache.get(key), code("invalid_input"));
	await assert.rejects(cache.set("ttl", "x", { ttlSeconds: 0 }), code("invalid_input"));
	await assert.rejects(cache.set("ttl", "x", { ttlSeconds: 604801 }), code("invalid_input"));
	await cache.setWithoutExpiry("persistent", "ephemeral but not expiring");
	assert.equal(await inspector.ttl(`${prefix}data:persistent`), -1);
	stage = "increments";
	const increments = await Promise.all(Array.from({ length: 100 }, (_, index) => (index % 2 ? cache : peer).increment("counter", { ttlSeconds: 30 })));
	assert.deepEqual([...increments].sort((a, b) => a - b), Array.from({ length: 100 }, (_, index) => index + 1));
	assert.equal(await cache.get("counter"), "100");
	const before = await inspector.pTTL(`${prefix}data:counter`);
	await cache.increment("counter", { by: -2, ttlSeconds: 100 });
	assert.equal(await cache.get("counter"), "98");
	assert.ok(await inspector.pTTL(`${prefix}data:counter`) <= before);
	await cache.increment("counter-ttl", { ttlSeconds: 1 });
	await eventually(async () => await cache.get("counter-ttl") === null);
	await cache.setWithoutExpiry("counter-persistent", "4");
	assert.equal(await cache.increment("counter-persistent", { ttlSeconds: 20 }), 5);
	assert.ok(await inspector.ttl(`${prefix}data:counter-persistent`) > 0);
	await cache.set("overflow", String(Number.MAX_SAFE_INTEGER));
	await assert.rejects(cache.increment("overflow", { ttlSeconds: 20 }), code("invalid_input"));
	assert.equal(await cache.get("overflow"), String(Number.MAX_SAFE_INTEGER));
	await cache.set("wrong-type", "not-an-integer");
	await assert.rejects(cache.increment("wrong-type", { ttlSeconds: 20 }), code("invalid_input"));
	stage = "leases";
	lease = await cache.acquireLease("exclusive", { ttlMs: 3000 }); assert.ok(lease);
	assert.equal(await peer.acquireLease("exclusive", { ttlMs: 3000 }), null);
	// Data namespace cannot release/overwrite a lease.
	await cache.delete("exclusive");
	assert.equal(await peer.acquireLease("exclusive", { ttlMs: 3000 }), null);
	const wrong = { ...lease, token: "0".repeat(64) };
	await assert.rejects(peer.releaseLease(wrong), code("lease_not_owned"));
	await assert.rejects(peer.renewLease(wrong, { ttlMs: 3000 }), code("lease_not_owned"));
	await cache.renewLease(lease, { ttlMs: 5000 });
	assert.ok(await inspector.pTTL(`${prefix}lease:exclusive`) > 3000);
	await cache.releaseLease(lease); lease = null;
	const stale = await cache.acquireLease("exclusive", { ttlMs: 150 }); assert.ok(stale);
	await eventually(async () => await inspector.exists(`${prefix}lease:exclusive`) === 0);
	lease = await peer.acquireLease("exclusive", { ttlMs: 3000 }); assert.ok(lease);
	await assert.rejects(cache.releaseLease(stale), code("lease_not_owned"));
	await assert.rejects(cache.renewLease(stale, { ttlMs: 3000 }), code("lease_not_owned"));
	assert.equal(await cache.acquireLease("exclusive", { ttlMs: 3000 }), null);
	await peer.releaseLease(lease); lease = null;
	await assert.rejects(cache.acquireLease("exclusive", { ttlMs: 0 }), code("invalid_input"));
	stage = "pubsub";
	const received: Buffer[] = [];
	subscription = await cache.subscribe("updates", (message) => { received.push(message); });
	assert.equal(await peer.publish("updates", "event"), 1);
	await eventually(async () => received.length === 1);
	assert.equal(received[0].toString(), "event");
	await assert.rejects(tiny.publish("updates", "123456789"), code("invalid_input"));
	await assert.rejects(cache.publish("", "x"), code("invalid_input"));
	await subscription.unsubscribe(); await subscription.unsubscribe();
	assert.equal(await peer.publish("updates", "missed"), 0);
	assert.equal(received.length, 1);
	subscription = await cache.subscribe("updates", (message) => { received.push(message); });
	// Recovery on disposable local Valkey only. Never restart user infrastructure.
	const project = process.env.CACHE_COMPAT_PROJECT;
	stage = "recovery";
	if (project && /^cache-compat-[a-f0-9]{8}$/.test(project)) {
		const compose = ["compose", "-f", "compose.cache.yaml", "-p", project];
		docker([...compose, "stop", "valkey"]);
		await assert.rejects(peer.checkCache(), (error) => ["unavailable", "timeout", "connection"].includes(cacheError(error).code));
		docker([...compose, "start", "valkey"]);
		await eventually(async () => { try { await peer.checkCache(); return true; } catch { return false; } }, 10000);
		await eventually(async () => { try { return await peer.publish("updates", "recovered") === 1; } catch { return false; } }, 10000);
		await eventually(async () => received.length >= 2);
	}
	await subscription.unsubscribe(); subscription = undefined;
	// Pause commands only on the compatibility-owned disposable service.
	if (project && /^cache-compat-[a-f0-9]{8}$/.test(project)) {
		stage = "command-timeout";
		await timeoutCache.checkCache();
		const pauseInspector = createClient({ url: process.env.CACHE_URL, socket: { reconnectStrategy: false } });
		pauseInspector.on("error", () => {});
		try {
			await pauseInspector.connect();
			await pauseInspector.sendCommand(["CLIENT", "PAUSE", "400", "ALL"]);
			await assert.rejects(timeoutCache.checkCache(), code("timeout"));
			await eventually(async () => { try { await timeoutCache.checkCache(); return true; } catch { return false; } });
		} finally { if (pauseInspector.isOpen) pauseInspector.destroy(); }
	}
	assert.ok(signals.some((signal) => signal.operation === "get" && signal.hit === false));
	assert.ok(signals.some((signal) => signal.operation === "set" && signal.valueBytes === 5));
	for (const signal of signals) assert.ok(Object.keys(signal).every((key) => ["operation", "outcome", "durationMs", "hit", "valueBytes"].includes(key)));
	// Loopback port is held without a listener: deterministic unavailable service.
	stage = "unavailable";
	const unavailableServer = createServer();
	await new Promise<void>((resolve) => unavailableServer.listen(0, "127.0.0.1", resolve));
	const unavailableAddress = unavailableServer.address(); assert.ok(unavailableAddress && typeof unavailableAddress !== "string");
	await new Promise<void>((resolve) => unavailableServer.close(() => resolve()));
	const unavailable = createCache({ env: { CACHE_URL: `redis://127.0.0.1:${unavailableAddress.port}`, CACHE_CONNECT_TIMEOUT_MS: "200" } });
	try { await assert.rejects(unavailable.checkCache(), code("unavailable")); } finally { await unavailable.close(); }
	console.info("Cache full contract: ping, strings/bytes, TTL/NX, limits, concurrent increments, leases, pub/sub, lifecycle and recovery passed");
} catch (error) {
	// Static errors only: assertions may embed values, keys or client details.
	console.error(`Cache contract failed at ${stage}: ${cacheError(error).code}`);
	process.exitCode = 1;
} finally {
	await subscription?.unsubscribe().catch(() => {});
	if (lease) await peer.releaseLease(lease).catch(() => {});
	// Exact own-key cleanup only, no scans/flush/prefix deletion.
	for (const key of dataKeys) await peer.delete(key).catch(() => {});
	await Promise.all([cache.close(), peer.close(), tiny.close(), brokenObserver.close(), timeoutCache.close()]);
	await cache.close();
	await assert.rejects(cache.get("closed"), code("unavailable"));
	if (inspector.isOpen) inspector.destroy();
}
