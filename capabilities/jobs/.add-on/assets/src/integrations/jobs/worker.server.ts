import type { PgBoss } from "pg-boss";
import { createJobsBoss } from "./boss.server";
import { ensureJobQueues } from "./client.server";
import { type JobName, jobRegistry, parseJobPayload } from "./registry";

function workerConcurrency() {
	const value = Number.parseInt(process.env.JOBS_CONCURRENCY ?? "4", 10);
	if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
		throw new Error("JOBS_CONCURRENCY must be an integer between 1 and 100");
	}
	return value;
}

export async function startJobsWorker(): Promise<PgBoss> {
	const boss = createJobsBoss();
	await boss.start();
	await ensureJobQueues(boss);

	for (const name of Object.keys(jobRegistry) as JobName[]) {
		await boss.work(
			name,
			{
				localConcurrency: workerConcurrency(),
				pollingIntervalSeconds: 0.5,
			},
			async ([job]) => {
				if (!job) throw new Error(`Worker received an empty ${name} batch`);
				const payload = parseJobPayload(name, job.data);
				console.info(
					JSON.stringify({ event: "job.started", id: job.id, name }),
				);
				try {
					const output = await jobRegistry[name].handler(payload as never);
					console.info(
						JSON.stringify({ event: "job.completed", id: job.id, name }),
					);
					return output;
				} catch (error) {
					console.error(
						JSON.stringify({
							error: error instanceof Error ? error.message : String(error),
							event: "job.failed",
							id: job.id,
							name,
						}),
					);
					throw error;
				}
			},
		);
	}

	console.info(
		JSON.stringify({
			event: "worker.ready",
			queues: Object.keys(jobRegistry),
		}),
	);
	return boss;
}
