import { eq } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { projects, user } from "#/db/schema";
import { createNotificationJobs } from "../notifications/jobs.server";
import { notificationValues } from "../notifications/notifications.server";
import { observeJob } from "../observability/http.server";
import {
	getJobsClient,
	sendJobInTransaction,
	stopJobsClient,
} from "./client.server";
import { jobRegistry } from "./registry";
import type { JobHandlerContext } from "./types";
import { startJobsWorker } from "./worker.server";

const ownerId = `jobs-owner-${crypto.randomUUID()}`;
const committedProjectId = crypto.randomUUID();
const rolledBackProjectId = crypto.randomUUID();
let worker: PgBoss;

async function waitForJob(
	id: string,
	state: string,
	queue: "starter.echo" | "notifications.deliver" = "starter.echo",
) {
	const boss = await getJobsClient();
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		const [job] = await boss.findJobs(queue, { id });
		if (job?.state === state) return job;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`Timed out waiting for job state ${state}`);
}

describe("transactional jobs", () => {
	it("composes native Jobs expiration and worker-close signals into Notifications without late delivery", async () => {
		for (const phase of ["expiration", "close"] as const) {
			const row = notificationValues({
				recipientId: ownerId,
				type: "fixture.cancellation",
				title: "Signal",
				body: "Fixture",
			});
			let release!: (value: typeof row) => void;
			const pending = new Promise<typeof row>((resolve) => {
				release = resolve;
			});
			let started!: () => void, cancelled!: () => void;
			const running = new Promise<void>((resolve) => {
				started = resolve;
			});
			const aborted = new Promise<void>((resolve) => {
				cancelled = resolve;
			});
			const adapter = vi.fn(async () => ({ outcome: "delivered" as const }));
			const composed = createNotificationJobs({
				load: async (_id, signal) => {
					signal.addEventListener("abort", cancelled, { once: true });
					started();
					return pending;
				},
				adapters: { email: adapter },
			})["notifications.deliver"].handler;
			const spy = vi
				.spyOn(jobRegistry["notifications.deliver"], "handler")
				.mockImplementation(composed);
			const boss = await getJobsClient();
			let id: string | null = null;
			try {
				id = await boss.send(
					"notifications.deliver",
					{ notificationId: row.id, channel: "email" },
					{ retryLimit: 0, expireInSeconds: phase === "expiration" ? 1 : 60 },
				);
				expect(id).toBeTruthy();
				await running;
				if (phase === "close")
					await worker.stop({ graceful: false, close: true });
				await aborted;
				release(row);
				await Promise.resolve();
				await Promise.resolve();
				expect(adapter).not.toHaveBeenCalled();
				expect(
					(await waitForJob(id!, "failed", "notifications.deliver")).retryCount,
				).toBe(0);
			} finally {
				release(row);
				spy.mockRestore();
				if (id) await boss.deleteJob("notifications.deliver", id);
				if (phase === "close") worker = await startJobsWorker();
			}
		}
	}, 30000);

	beforeAll(async () => {
		await db.insert(user).values({
			id: ownerId,
			name: "Jobs owner",
			email: `${ownerId}@example.test`,
		});
		worker = await startJobsWorker({ execute: observeJob });
	});

	afterAll(async () => {
		await worker.stop({ graceful: true, timeout: 10_000 });
		const boss = await getJobsClient();
		await boss.deleteAllJobs("starter.echo");
		await db.delete(user).where(eq(user.id, ownerId));
		await stopJobsClient();
	});

	it("commits the application write and job atomically", async () => {
		let jobId = "";
		await db.transaction(async (tx) => {
			await tx.insert(projects).values({
				id: committedProjectId,
				ownerId,
				name: "Committed with job",
			});
			jobId = await sendJobInTransaction(tx, "starter.echo", {
				message: "committed",
			});
		});
		const [project] = await db
			.select()
			.from(projects)
			.where(eq(projects.id, committedProjectId));
		const boss = await getJobsClient();
		const [job] = await boss.findJobs("starter.echo", { id: jobId });
		expect(project?.name).toBe("Committed with job");
		expect(job?.id).toBe(jobId);
	});

	it("rolls back the application write and job atomically", async () => {
		let jobId = "";
		await expect(
			db.transaction(async (tx) => {
				await tx.insert(projects).values({
					id: rolledBackProjectId,
					ownerId,
					name: "Rolled back with job",
				});
				jobId = await sendJobInTransaction(tx, "starter.echo", {
					message: "rolled back",
				});
				throw new Error("intentional rollback");
			}),
		).rejects.toThrow("intentional rollback");
		const [project] = await db
			.select()
			.from(projects)
			.where(eq(projects.id, rolledBackProjectId));
		const boss = await getJobsClient();
		const [job] = await boss.findJobs("starter.echo", { id: jobId });
		expect(project).toBeUndefined();
		expect(job).toBeUndefined();
	});

	it("refuses mismatched routing before enqueue and rolls back the real transaction", async () => {
		const domain = process.env.DATABASE_URL;
		if (!domain)
			throw new Error("DATABASE_URL is required for Jobs integration tests");
		const previous = process.env.PGBOSS_DATABASE_URL;
		const boss = await getJobsClient();
		try {
			for (const [key, value] of [
				["host", "other.invalid"],
				["port", "1"],
			]) {
				const projectId = crypto.randomUUID(),
					message = `routing-refusal-${projectId}`;
				const routed = new URL(domain);
				routed.searchParams.set(key, value);
				process.env.PGBOSS_DATABASE_URL = routed.toString();
				await expect(
					db.transaction(async (tx) => {
						await tx
							.insert(projects)
							.values({ id: projectId, ownerId, name: "Routing refusal" });
						await sendJobInTransaction(tx, "starter.echo", { message });
					}),
				).rejects.toThrow("Jobs database configuration is invalid");
				expect(
					await db.select().from(projects).where(eq(projects.id, projectId)),
				).toEqual([]);
				expect(
					(await boss.findJobs("starter.echo")).some(
						(job) => (job.data as { message?: string }).message === message,
					),
				).toBe(false);
			}
		} finally {
			if (previous === undefined) delete process.env.PGBOSS_DATABASE_URL;
			else process.env.PGBOSS_DATABASE_URL = previous;
		}
	});

	it("fails payloads that bypass the typed enqueue boundary", async () => {
		const boss = await getJobsClient();
		const id = await boss.send("starter.echo", { message: "" });
		if (!id) throw new Error("pg-boss did not create the invalid test job");
		const deadline = Date.now() + 10_000;
		while (Date.now() < deadline) {
			const [job] = await boss.findJobs("starter.echo", { id });
			if (job?.state === "failed") {
				expect(job.output).toBeDefined();
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		throw new Error("Timed out waiting for invalid job to fail");
	});

	it("forwards native per-job retry metadata through the optional execution hook", async () => {
		const attempts: JobHandlerContext[] = [];
		const original = jobRegistry["starter.echo"].handler;
		const handler = vi
			.spyOn(jobRegistry["starter.echo"], "handler")
			.mockImplementation(async (payload, context) => {
				if (payload.message !== "retry-context") return original(payload);
				if (!context) throw new Error("Missing handler context");
				attempts.push(context);
				if (context.retryCount === 0) throw new Error("Retry this attempt");
				return { echoed: payload.message };
			});
		try {
			const boss = await getJobsClient();
			const id = await boss.send(
				"starter.echo",
				{ message: "retry-context" },
				{ retryLimit: 2, retryDelay: 0 },
			);
			if (!id) throw new Error("Missing test job");
			const completed = await waitForJob(id, "completed");
			expect(completed.retryCount).toBe(1);
			expect(
				attempts.map(({ id, retryCount, retryLimit }) => ({
					id,
					retryCount,
					retryLimit,
				})),
			).toEqual([
				{ id, retryCount: 0, retryLimit: 2 },
				{ id, retryCount: 1, retryLimit: 2 },
			]);
			expect(
				attempts.every(({ signal }) => signal instanceof AbortSignal),
			).toBe(true);
		} finally {
			handler.mockRestore();
		}
	});

	it("forwards expiration cancellation and retains native retry settlement", async () => {
		const attempts: JobHandlerContext[] = [];
		const original = jobRegistry["starter.echo"].handler;
		const handler = vi
			.spyOn(jobRegistry["starter.echo"], "handler")
			.mockImplementation(async (payload, context) => {
				if (payload.message !== "expire-context") return original(payload);
				if (!context) throw new Error("Missing handler context");
				attempts.push(context);
				if (context.retryCount === 0) {
					await new Promise<void>((_, reject) =>
						context.signal.addEventListener(
							"abort",
							() => reject(context.signal.reason),
							{ once: true },
						),
					);
				}
				return { echoed: payload.message };
			});
		try {
			const boss = await getJobsClient();
			const id = await boss.send(
				"starter.echo",
				{ message: "expire-context" },
				{ retryLimit: 1, retryDelay: 0, expireInSeconds: 1 },
			);
			if (!id) throw new Error("Missing test job");
			expect((await waitForJob(id, "completed")).retryCount).toBe(1);
			expect(attempts[0]?.signal.aborted).toBe(true);
			expect(attempts.map(({ retryCount }) => retryCount)).toEqual([0, 1]);
		} finally {
			handler.mockRestore();
		}
	});

	it("cancels an active handler on close and leaves its retry available to a replacement worker", async () => {
		let started!: (context: JobHandlerContext) => void;
		const running = new Promise<JobHandlerContext>((resolve) => {
			started = resolve;
		});
		const original = jobRegistry["starter.echo"].handler;
		const handler = vi
			.spyOn(jobRegistry["starter.echo"], "handler")
			.mockImplementation(async (payload, context) => {
				if (payload.message !== "close-context" || context?.retryCount !== 0)
					return original(payload);
				started(context);
				await new Promise<void>((_, reject) =>
					context.signal.addEventListener(
						"abort",
						() => reject(context.signal.reason),
						{ once: true },
					),
				);
				return {};
			});
		try {
			const boss = await getJobsClient();
			const id = await boss.send(
				"starter.echo",
				{ message: "close-context" },
				{ retryLimit: 1, retryDelay: 0 },
			);
			if (!id) throw new Error("Missing test job");
			const context = await running;
			await worker.stop({ graceful: false, close: true });
			expect(context.id).toBe(id);
			expect(context.signal.aborted).toBe(true);
			expect((await waitForJob(id, "retry")).retryLimit).toBe(1);
			// The replacement exercises dispatch without the optional telemetry hook too.
			worker = await startJobsWorker();
			expect((await waitForJob(id, "completed")).retryCount).toBe(1);
		} finally {
			handler.mockRestore();
		}
	});
});
