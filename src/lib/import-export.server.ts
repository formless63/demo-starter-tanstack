import { and, asc, eq, sql } from "drizzle-orm";
import * as transferDatabaseSchema from "../db/schema";
import { projects, user } from "../db/schema";
import { env } from "../env";
import {
	type ProjectData,
	projectInputSchema,
} from "../features/projects/project-schema";
import { insertProjectInTransaction } from "../features/projects/project-write.server";
import { AuditLogError } from "../integrations/audit-log/validation";
import { createTransferTransactions } from "../integrations/import-export/database.server";
import { createTransferJobs } from "../integrations/import-export/jobs.server";
import {
	createTransferRegistry,
	defineTransferDefinition,
} from "../integrations/import-export/registry.server";
import { createTransfers } from "../integrations/import-export/service.server";
import { TransferError } from "../integrations/import-export/validation";
import { getStorage } from "../integrations/storage/storage.server";

// This personal sample deliberately does not authorize tenant scopes or trust an active organization.
const registry = createTransferRegistry([
	defineTransferDefinition<ProjectData>({
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
				const data = raw;
				try {
					await insertProjectInTransaction(tx, context.requesterId, data);
				} catch (error) {
					if (error instanceof AuditLogError && error.code === "DATABASE_ERROR")
						throw new TransferError("unavailable");
					throw error;
				}
			}
		},
		async *exportRows(tx, context, signal) {
			let after: { time: string; id: string } | undefined;
			for (;;) {
				signal.throwIfAborted();
				const rows = await tx
					.select({
						id: projects.id,
						time: sql<string>`${projects.createdAt}::text`,
						name: sql<string>`case when octet_length(${projects.name})<=65536 then ${projects.name} else null end`,
						description: sql<
							string | null
						>`case when octet_length(${projects.description})<=65536 then ${projects.description} else null end`,
						nameBytes: sql<number>`octet_length(${projects.name})`,
						descriptionBytes: sql<number>`coalesce(octet_length(${projects.description}),0)`,
					})
					.from(projects)
					.where(
						and(
							eq(projects.ownerId, context.requesterId),
							after
								? sql`(${projects.createdAt},${projects.id}) > (${after.time}::timestamptz,${after.id})`
								: undefined,
						),
					)
					.orderBy(asc(projects.createdAt), asc(projects.id))
					.limit(100);
				for (const row of rows) {
					signal.throwIfAborted();
					if (row.nameBytes > 65536 || row.descriptionBytes > 65536)
						throw new TransferError("limit-exceeded");
					yield [row.name, row.description];
				}
				if (rows.length < 100) break;
				const last = rows[rows.length - 1];
				after = { time: last.time, id: last.id };
			}
		},
	}),
]);
export const applicationTransfers = createTransfers({
	transaction: createTransferTransactions(
		() => env.DATABASE_URL,
		transferDatabaseSchema,
	),
	registry,
	storage: getStorage,
	enqueue: async (tx, transferId) =>
		(await import("../integrations/jobs/client.server")).sendJobInTransaction(
			tx,
			"import-export.run",
			{ transferId },
		),
	jobs: async () =>
		(await import("../integrations/jobs/client.server")).getJobsClient(),
});
export const referenceTransferJobs = createTransferJobs((id, attempt) =>
	applicationTransfers.run(id, attempt),
);
