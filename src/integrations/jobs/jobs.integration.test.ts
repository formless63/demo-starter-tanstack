import { eq } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "#/db";
import { projects, user } from "#/db/schema";
import {
	getJobsClient,
	sendJobInTransaction,
	stopJobsClient,
} from "./client.server";
import { startJobsWorker } from "./worker.server";

const ownerId = `jobs-owner-${crypto.randomUUID()}`;
const committedProjectId = crypto.randomUUID();
const rolledBackProjectId = crypto.randomUUID();
let worker: PgBoss;

describe("transactional jobs", () => {
	beforeAll(async () => {
		await db.insert(user).values({
			id: ownerId,
			name: "Jobs owner",
			email: `${ownerId}@example.test`,
		});
		worker = await startJobsWorker();
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
});
