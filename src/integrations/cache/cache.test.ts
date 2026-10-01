import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { CacheError, createCache } from "./cache.server";
import { cacheConfig } from "./config.server";

describe("cache without infrastructure", () => {
	it("validates configuration only on use and closes unused clients", async () => {
		const cache = createCache({ env: {} });
		await expect(cache.checkCache()).rejects.toMatchObject({
			code: "configuration",
		});
		await cache.close();
		await cache.close();
		await createCache({ env: {} }).close();
	});
	it("rejects oversize input before attempting a connection", async () => {
		const cache = createCache({
			env: { CACHE_URL: "redis://127.0.0.1:1", CACHE_MAX_VALUE_BYTES: "2" },
		});
		await expect(cache.set("key", "oversized")).rejects.toMatchObject({
			code: "invalid-input",
		});
		await expect(cache.publish("channel", "oversized")).rejects.toMatchObject({
			code: "invalid-input",
		});
		await expect(cache.get("bad\nkey")).rejects.toMatchObject({
			code: "invalid-input",
		});
		await cache.close();
	});
	it("keeps provider credentials and data out of serialized and inspected errors", () => {
		const cause = new Error(
			"rediss://user:secret@host/key?value=private-token",
		);
		const error = new CacheError("unavailable", cause);
		expect(error.cause).toBe(cause);
		expect(JSON.stringify(error)).not.toContain(cause.message);
		expect(inspect(error)).not.toContain(cause.message);
		expect(() => cacheConfig({ CACHE_URL: cause.message })).toThrow(CacheError);
	});
});
