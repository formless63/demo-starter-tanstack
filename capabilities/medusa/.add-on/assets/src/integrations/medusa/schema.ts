import { sql } from "drizzle-orm";
import {
	boolean,
	check,
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
import type { Projection } from "./projection";

const time = (name: string) =>
	timestamp(name, { withTimezone: true, precision: 3, mode: "date" });
export const medusaBindings = pgTable(
	"medusa_binding",
	{
		id: uuid("id").primaryKey(),
		scopeKind: varchar("scope_kind", { length: 6 }).notNull(),
		scopeId: varchar("scope_id", { length: 128 }).notNull(),
		localResourceId: varchar("local_resource_id", { length: 128 }).notNull(),
		connectionId: varchar("connection_id", { length: 64 }).notNull(),
		resourceKind: varchar("resource_kind", { length: 7 }).notNull(),
		remoteId: varchar("remote_id", { length: 128 }).notNull(),
		createdAt: time("created_at").notNull(),
		retiredAt: time("retired_at"),
		revision: integer("revision").default(0).notNull(),
		leaseToken: uuid("lease_token"),
		leaseUntil: time("lease_until"),
	},
	(t) => [
		uniqueIndex("medusa_binding_remote_unique").on(
			t.connectionId,
			t.resourceKind,
			t.remoteId,
		),
		uniqueIndex("medusa_binding_local_active_unique")
			.on(t.scopeKind, t.scopeId, t.resourceKind, t.localResourceId)
			.where(sql`${t.retiredAt} is null`),
		check("medusa_binding_kind", sql`${t.resourceKind} in ('product','order')`),
		check("medusa_binding_scope", sql`${t.scopeKind} in ('user','tenant')`),
	],
);
export const medusaProjections = pgTable(
	"medusa_projection",
	{
		bindingId: uuid("binding_id")
			.primaryKey()
			.references(() => medusaBindings.id),
		value: jsonb("value").$type<Projection>().notNull(),
		createdAt: time("created_at").notNull(),
		syncedAt: time("synced_at").notNull(),
	},
	(t) => [
		index("medusa_projection_page_idx").on(
			t.createdAt.desc(),
			t.bindingId.desc(),
		),
	],
);
export const medusaOperations = pgTable(
	"medusa_operation",
	{
		id: uuid("id").primaryKey(),
		scopeKind: varchar("scope_kind", { length: 6 }).notNull(),
		scopeId: varchar("scope_id", { length: 128 }).notNull(),
		actorUserId: varchar("actor_user_id", { length: 128 }).notNull(),
		connectionId: varchar("connection_id", { length: 64 }).notNull(),
		kind: varchar("kind", { length: 32 }).notNull(),
		bindingId: uuid("binding_id").references(() => medusaBindings.id),
		callerKey: varchar("caller_key", { length: 128 }).notNull(),
		digest: varchar("digest", { length: 64 }).notNull(),
		intent: jsonb("intent")
			.$type<{ kind: "product" | "order"; limit?: number; offset?: number }>()
			.notNull(),
		status: varchar("status", { length: 24 }).notNull(),
		createdAt: time("created_at").notNull(),
		updatedAt: time("updated_at").notNull(),
		firstDispatchAt: time("first_dispatch_at"),
		attemptToken: uuid("attempt_token"),
		leaseUntil: time("lease_until"),
		revision: integer("revision").default(0).notNull(),
		errorCode: varchar("error_code", { length: 24 }),
		processed: integer("processed").default(0).notNull(),
		nextCursor: text("next_cursor"),
	},
	(t) => [
		uniqueIndex("medusa_operation_intent_unique").on(
			t.scopeKind,
			t.scopeId,
			t.connectionId,
			t.kind,
			t.callerKey,
		),
		check(
			"medusa_operation_kind",
			sql`${t.kind} in ('reconcile_product','reconcile_order','sync_product_page','sync_order_page')`,
		),
		check(
			"medusa_operation_status",
			sql`${t.status} in ('queued','dispatching','succeeded','failed','reconciliation_required','cancelled')`,
		),
	],
);
export const medusaInbox = pgTable(
	"medusa_inbox",
	{
		id: uuid("id").primaryKey(),
		connectionId: varchar("connection_id", { length: 64 }).notNull(),
		eventId: uuid("event_id").notNull(),
		bodySha256: varchar("body_sha256", { length: 64 }).notNull(),
		eventType: varchar("event_type", { length: 32 }).notNull(),
		conflictDigest: varchar("conflict_digest", { length: 64 }),
		reconcileAgain: boolean("reconcile_again").default(false).notNull(),
		bindingId: uuid("binding_id").references(() => medusaBindings.id),
		remoteHint: varchar("remote_hint", { length: 128 }),
		state: varchar("state", { length: 12 }).notNull(),
		receivedAt: time("received_at").notNull(),
		updatedAt: time("updated_at").notNull(),
		revision: integer("revision").default(0).notNull(),
		attemptToken: uuid("attempt_token"),
		leaseUntil: time("lease_until"),
		errorCode: varchar("error_code", { length: 24 }),
	},
	(t) => [
		uniqueIndex("medusa_inbox_event_unique").on(t.connectionId, t.eventId),
		check(
			"medusa_inbox_state",
			sql`${t.state} in ('received','processing','processed','ignored','failed')`,
		),
	],
);
