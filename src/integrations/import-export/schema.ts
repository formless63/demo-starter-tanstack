import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import type { TransferErrorCode, ValidationIssue } from "./validation";
const time = (name: string) =>
	timestamp(name, { withTimezone: true, precision: 3, mode: "date" });
export const transfers = pgTable(
	"import_export_transfer",
	{
		id: uuid("id").primaryKey(),
		requesterId: varchar("requester_id", { length: 128 }).notNull(),
		scopeKind: varchar("scope_kind", { length: 6 })
			.$type<"user" | "tenant">()
			.notNull(),
		scopeId: varchar("scope_id", { length: 128 }).notNull(),
		definition: varchar("definition", { length: 64 }).notNull(),
		version: varchar("version", { length: 64 }).notNull(),
		direction: varchar("direction", { length: 6 })
			.$type<"import" | "export">()
			.notNull(),
		status: varchar("status", { length: 12 })
			.$type<
				| "uploading"
				| "staged"
				| "pending"
				| "succeeded"
				| "failed"
				| "cancelled"
			>()
			.notNull(),
		createdAt: time("created_at").notNull(),
		updatedAt: time("updated_at").notNull(),
		startedAt: time("started_at"),
		completedAt: time("completed_at"),
		snapshotAt: time("snapshot_at"),
		artifactExpiresAt: time("artifact_expires_at"),
		idempotencyKey: varchar("idempotency_key", { length: 128 }),
		fingerprint: varchar("fingerprint", { length: 64 }),
		sourceHash: varchar("source_hash", { length: 64 }),
		sourceLength: integer("source_length"),
		sourceKey: text("source_key"),
		outputKey: text("output_key"),
		artifactKeys: jsonb("artifact_keys")
			.$type<string[]>()
			.default([])
			.notNull(),
		jobId: uuid("job_id"),
		jobQueue: varchar("job_queue", { length: 64 }),
		rowCount: integer("row_count"),
		byteCount: integer("byte_count"),
		errorCode: varchar("error_code", { length: 32 }).$type<TransferErrorCode>(),
		issues: jsonb("issues").$type<ValidationIssue[]>().default([]).notNull(),
		errorsTruncated: integer("errors_truncated").default(0).notNull(),
	},
	(t) => [
		uniqueIndex("transfer_request_key_idx").on(
			t.requesterId,
			t.scopeKind,
			t.scopeId,
			t.direction,
			t.idempotencyKey,
		),
		index("transfer_visibility_time_idx").on(
			t.requesterId,
			t.scopeKind,
			t.scopeId,
			t.createdAt.desc(),
			t.id.desc(),
		),
	],
);
export type Transfer = typeof transfers.$inferSelect;
