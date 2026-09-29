import { sql } from "drizzle-orm";
import { fromDrizzle, type PgBoss } from "pg-boss";
import type { db } from "#/db";
import { createJobsBoss } from "./boss.server";
import { type JobName, type JobPayload, jobRegistry } from "./registry";

type AppTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

let clientPromise: Promise<PgBoss> | undefined;

export async function ensureJobQueues(boss: PgBoss) {
	await Promise.all(
		(Object.keys(jobRegistry) as JobName[]).map((name) =>
			boss.createQueue(name, jobRegistry[name].queue),
		),
	);
}

export async function getJobsClient() {
	clientPromise ??= (async () => {
		const boss = createJobsBoss();
		await boss.start();
		await ensureJobQueues(boss);
		return boss;
	})();
	return clientPromise;
}

export async function stopJobsClient() {
	if (!clientPromise) return;
	const boss = await clientPromise;
	clientPromise = undefined;
	await boss.stop({ graceful: true, timeout: 10_000 });
}

export async function sendJob<TName extends JobName>(
	name: TName,
	payload: JobPayload<TName>,
) {
	const parsed = jobRegistry[name].payload.parse(payload);
	const boss = await getJobsClient();
	const id = await boss.send(name, parsed, jobRegistry[name].queue);
	if (!id) throw new Error(`pg-boss did not create ${name}`);
	return id;
}

export async function sendJobInTransaction<TName extends JobName>(
	tx: AppTransaction,
	name: TName,
	payload: JobPayload<TName>,
) {
	const parsed = jobRegistry[name].payload.parse(payload);
	const boss = await getJobsClient();
	const id = await boss.send(name, parsed, {
		...jobRegistry[name].queue,
		db: fromDrizzle(tx, sql),
	});
	if (!id) throw new Error(`pg-boss did not create ${name}`);
	return id;
}
