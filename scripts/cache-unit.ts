import { TimeoutError, ClientOfflineError } from "redis";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { createCache, CacheError, cacheError } from "../src/integrations/cache/cache.server";
import { cacheConfig, logicalName } from "../src/integrations/cache/config.server";

const safe = (error: unknown) => error instanceof CacheError && error.code === "configuration";
for (const env of [ {}, { CACHE_URL: "https://bad" }, { CACHE_URL: "redis://host", CACHE_KEY_PREFIX: "" }, { CACHE_URL: "redis://host", CACHE_MAX_VALUE_BYTES: "16777217" }, { CACHE_URL: "redis://host", CACHE_DEFAULT_TTL_SECONDS: "0" }, { CACHE_URL: "redis://host", CACHE_CONNECT_TIMEOUT_MS: "10001" }, { CACHE_URL: "redis://host", CACHE_COMMAND_TIMEOUT_MS: "NaN" } ]) assert.throws(() => cacheConfig(env), safe);
for (const url of ["redis://127.0.0.1:6379", "rediss://user:password@example.com:6380/0"]) {
	const config = cacheConfig({ CACHE_URL: url });
	assert.equal(config.prefix, "app:"); assert.equal(config.ttlSeconds, 300); assert.equal(config.maxValueBytes, 1048576);
}
for (const name of ["", "\n", "has space", "a".repeat(257), "é", "a\u007f"]) assert.throws(() => logicalName(name));
assert.equal(logicalName("one/a:2_b.c-d"), "one/a:2_b.c-d");
const secret = "redis://username:password@host/private-key/value/token";
const error = new CacheError("connection", new Error(secret));
assert.equal(error.cause instanceof Error, true);
assert.equal(JSON.stringify(error).includes(secret), false);
assert.equal(inspect(error).includes(secret), false);
assert.equal(cacheError(Object.assign(new Error("WRONGPASS credentials"), {})).code, "authentication");
assert.equal(cacheError(Object.assign(new Error(secret), { code: "ECONNREFUSED" })).code, "unavailable");
assert.equal(cacheError(Object.assign(new Error(secret), { name: "TimeoutError" })).code, "timeout");
assert.equal(cacheError(new TimeoutError()).code, "timeout");
assert.equal(cacheError(new ClientOfflineError()).code, "unavailable");
const lazy = createCache({ env: {} });
await assert.rejects(lazy.get("x"), safe);
await lazy.close(); await lazy.close();
const unused = createCache({ env: {} }); await unused.close();
const validated = createCache({ env: { CACHE_URL: "redis://127.0.0.1:1", CACHE_MAX_VALUE_BYTES: "8" } });
const invalid = (error: unknown) => error instanceof CacheError && error.code === "invalid_input";
await assert.rejects(validated.set("key", "123456789"), invalid);
await assert.rejects(validated.publish("channel", "123456789"), invalid);
await assert.rejects(validated.acquireLease("lease", { ttlMs: 300001 }), invalid);
await assert.rejects(validated.increment("counter", { ttlSeconds: 0 }), invalid);
await validated.close();
console.info("Backendless cache configuration, limits, safety and lazy lifecycle passed");
