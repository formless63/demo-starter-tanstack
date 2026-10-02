import { EventEmitter } from "node:events";
import { setImmediate } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { trackFixturePool } from "./stripe-fixture-pool";

class PoolFixture extends EventEmitter {
	endError?: Error;
	endStarted = false;
	async end() {
		this.endStarted = true;
		if (this.endError) throw this.endError;
	}
}

// Reproduce pg-pool's early end() resolution without relying on OS socket timing.
describe("Stripe fixture pool teardown", () => {
	it("waits for every actual client end before database cleanup", async () => {
		const pool = new PoolFixture();
		const close = trackFixturePool(pool);
		const first = new EventEmitter();
		const last = new EventEmitter();
		pool.emit("connect", first);
		pool.emit("connect", last);
		// pg-pool removes an idle client before its asynchronous end callback.
		pool.emit("remove", first);
		let dropped = false;
		const cleanup = close().then(() => { dropped = true; });
		await setImmediate();
		expect(pool.endStarted).toBe(true);
		expect(dropped).toBe(false);
		last.emit("end");
		await setImmediate();
		expect(dropped).toBe(false);
		first.emit("end");
		await cleanup;
		expect(dropped).toBe(true);
	});

	it("handles unused pools and clients that already disconnected", async () => {
		const unused = new PoolFixture();
		await trackFixturePool(unused)();
		const pool = new PoolFixture();
		const close = trackFixturePool(pool);
		const client = new EventEmitter();
		pool.emit("connect", client);
		client.emit("end");
		await close();
	});

	it("preserves teardown rejections and never proceeds to database cleanup", async () => {
		const pool = new PoolFixture();
		const error = new Error("pool teardown failed");
		pool.endError = error;
		let dropped = false;
		await expect(trackFixturePool(pool)().then(() => { dropped = true; })).rejects.toBe(error);
		expect(dropped).toBe(false);
	});

	it("fails visibly if an owned client never ends", async () => {
		const pool = new PoolFixture();
		const close = trackFixturePool(pool, 10);
		pool.emit("connect", new EventEmitter());
		let dropped = false;
		await expect(close().then(() => { dropped = true; })).rejects.toThrow(
			"Timed out closing fixture database connections",
		);
		expect(dropped).toBe(false);
	});

	it("does not swallow unexpected pool errors", () => {
		const pool = new PoolFixture();
		trackFixturePool(pool);
		const error = new Error("unexpected connection failure");
		expect(() => pool.emit("error", error)).toThrow(error);
	});
});
