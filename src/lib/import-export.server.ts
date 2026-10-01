import { asc, eq } from "drizzle-orm";
import * as transferDatabaseSchema from "../db/schema";
import { projects, user } from "../db/schema";
import { env } from "../env";
import { projectInputSchema } from "../features/projects/project-schema";
import { insertProjectInTransaction } from "../features/projects/project-write.server";
import { createTransferTransactions } from "../integrations/import-export/database.server";
import { createTransferJobs } from "../integrations/import-export/jobs.server";
import { createTransferRegistry } from "../integrations/import-export/registry.server";
import { createTransfers } from "../integrations/import-export/service.server";
import {
	getJobsClient,
	sendJobInTransaction,
} from "../integrations/jobs/client.server";
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
				await insertProjectInTransaction(tx, context.requesterId, data);
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
	transaction: createTransferTransactions(
		() => env.DATABASE_URL,
		transferDatabaseSchema,
	),
	registry,
	storage: getStorage,
	enqueue: (tx, transferId) =>
		sendJobInTransaction(tx, "import-export.run", { transferId }),
	jobs: () => getJobsClient(),
});
export const referenceTransferJobs = createTransferJobs((id, attempt) =>
	applicationTransfers.run(id, attempt),
);
