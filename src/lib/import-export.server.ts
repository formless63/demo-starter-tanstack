import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { projects, user } from "../db/schema";
import { projectInputSchema } from "../features/projects/project-schema";
import {
	appendAuditEvent,
	createAuditActor,
	createAuditSubject,
} from "../integrations/audit-log/audit.server";
import {
	getJobsClient,
	sendJobInTransaction,
} from "../integrations/jobs/client.server";
import { createTransferJobs } from "../integrations/import-export/jobs.server";
import { createTransferRegistry } from "../integrations/import-export/registry.server";
import { createTransfers } from "../integrations/import-export/service.server";
import { getStorage } from "../integrations/storage/storage.server";
// This personal sample deliberately does not authorize tenant scopes or trust an active organization.
const registry = createTransferRegistry([
	{
		name: "projects",
		version: "1",
		columns: ["name", "description"],
		rowSchema: projectInputSchema,
		async authorize(tx, context) {
			if (
				context.scope.kind !== "user" ||
				context.scope.id !== context.requesterId
			)
				return false;
			const [current] = await tx
				.select({ id: user.id })
				.from(user)
				.where(eq(user.id, context.requesterId));
			return !!current;
		},
		async importRows(tx, rows, context, signal) {
			for (const raw of rows) {
				signal.throwIfAborted();
				const data = projectInputSchema.parse(raw);
				const [project] = await tx
					.insert(projects)
					.values({
						id: crypto.randomUUID(),
						ownerId: context.requesterId,
						name: data.name,
						description: data.description || null,
					})
					.returning({ id: projects.id });
				await appendAuditEvent(tx, {
					actor: createAuditActor("user", context.requesterId),
					action: "projects.create",
					subject: createAuditSubject("project", project.id),
					outcome: "success",
					metadata: { source: "application" },
				});
			}
		},
		async *exportRows(tx, context, signal) {
			const rows = await tx
				.select({ name: projects.name, description: projects.description })
				.from(projects)
				.where(eq(projects.ownerId, context.requesterId))
				.orderBy(asc(projects.createdAt), asc(projects.id))
				.limit(100001);
			for (const row of rows) {
				signal.throwIfAborted();
				yield [row.name, row.description];
			}
		},
	},
]);
export const applicationTransfers = createTransfers({
	db,
	registry,
	storage: getStorage,
	enqueue: (tx, transferId) =>
		sendJobInTransaction(tx, "import-export.run", { transferId }),
	jobs: getJobsClient,
});
export const referenceTransferJobs = createTransferJobs((id, attempt) =>
	applicationTransfers.run(id, attempt),
);
