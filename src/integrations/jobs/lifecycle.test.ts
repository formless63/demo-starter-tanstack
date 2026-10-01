import { afterEach, expect, it, vi } from "vitest";
import {
	assertTransactionalJobsDatabase,
	jobsDatabaseUrl,
	jobsListenNotify,
	jobsSchema,
	workerConcurrency,
} from "./boss.server";
import { createJobsLifecycle } from "./lifecycle.server";

const previous = new Map<string, string | undefined>();
function setEnv(name: string, value: string) {
	if (!previous.has(name)) previous.set(name, process.env[name]);
	process.env[name] = value;
}
afterEach(() => {
	for (const [name, value] of previous) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
	previous.clear();
});
it("recovers failed startup, cleans partial initialization and shares concurrent starts", async () => {
	let fail = true;
	const stop = vi.fn(async () => {});
	const start = vi.fn(async () => {
		if (fail) throw new Error("startup");
		return {} as never;
	});
	const lifecycle = createJobsLifecycle(
		() => ({ start, stop }),
		async () => {},
	);
	await expect(lifecycle.get()).rejects.toThrow("startup");
	expect(stop).toHaveBeenCalledOnce();
	fail = false;
	const [one, two] = await Promise.all([lifecycle.get(), lifecycle.get()]);
	expect(one).toBe(two);
	expect(start).toHaveBeenCalledTimes(2);
	await lifecycle.stop();
	await lifecycle.get();
	expect(start).toHaveBeenCalledTimes(3);
	await lifecycle.stop();
});
it("cleans a queue-registration failure and serializes restart after drain", async () => {
	let complete!: () => void;
	const stop = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				complete = resolve;
			}),
	);
	const start = vi.fn(async () => ({}) as never);
	const lifecycle = createJobsLifecycle(
		() => ({ start, stop }),
		async () => {},
	);
	await lifecycle.get();
	const stopping = lifecycle.stop();
	await Promise.resolve();
	await Promise.resolve();
	const next = lifecycle.get();
	expect(start).toHaveBeenCalledOnce();
	complete();
	await stopping;
	await next;
	expect(start).toHaveBeenCalledTimes(2);
	let first = true;
	const cleanup = vi.fn(async () => {});
	const partial = createJobsLifecycle(
		() => ({ start, stop: cleanup }),
		async () => {
			if (first) {
				first = false;
				throw new Error("queues");
			}
		},
	);
	await expect(partial.get()).rejects.toThrow("queues");
	expect(cleanup).toHaveBeenCalledOnce();
	await partial.get();
	await partial.stop();
});
it("uses empty optional fallback and rejects malformed Jobs settings before networking", () => {
	setEnv("DATABASE_URL", "postgresql://one:secret@localhost/db");
	setEnv("PGBOSS_DATABASE_URL", "");
	expect(jobsDatabaseUrl()).toContain("/db");
	for (const value of ["4garbage", "4.5", "0", "101"]) {
		setEnv("JOBS_CONCURRENCY", value);
		expect(workerConcurrency).toThrow();
	}
	setEnv("JOBS_CONCURRENCY", "4");
	expect(workerConcurrency()).toBe(4);
	setEnv("PGBOSS_USE_LISTEN_NOTIFY", "yes");
	expect(jobsListenNotify).toThrow();
	setEnv("PGBOSS_SCHEMA", "x".repeat(64));
	expect(jobsSchema).toThrow();
	setEnv(
		"PGBOSS_DATABASE_URL",
		"postgres://different:credential@localhost:5432/db",
	);
	expect(assertTransactionalJobsDatabase).not.toThrow();
	setEnv(
		"PGBOSS_DATABASE_URL",
		"postgres://different:credential@localhost/isolated",
	);
	expect(assertTransactionalJobsDatabase).toThrow(/same canonical/);
});
