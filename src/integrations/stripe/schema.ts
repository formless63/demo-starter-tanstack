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
import type { ErrorCode } from "./contract";

const time = (name: string) =>
	timestamp(name, { withTimezone: true, precision: 3, mode: "date" });
export const stripeBindings = pgTable(
	"stripe_binding",
	{
		id: uuid("id").primaryKey(),
		scopeKind: varchar("scope_kind", { length: 6 })
			.$type<"user" | "tenant">()
			.notNull(),
		scopeId: varchar("scope_id", { length: 128 }).notNull(),
		localResourceId: varchar("local_resource_id", { length: 128 }).notNull(),
		connectionId: varchar("connection_id", { length: 64 }).notNull(),
		resourceKind: varchar("resource_kind", { length: 8 })
			.$type<"customer" | "checkout" | "payment">()
			.notNull(),
		remoteId: varchar("remote_id", { length: 128 }).notNull(),
		createdAt: time("created_at").notNull(),
		retiredAt: time("retired_at"),
		revision: integer("revision").default(0).notNull(),
		leaseToken: uuid("lease_token"),
		leaseUntil: time("lease_until"),
	},
	(t) => [
		uniqueIndex("stripe_binding_local_idx").on(
			t.scopeKind,
			t.scopeId,
			t.localResourceId,
			t.resourceKind,
		),
		uniqueIndex("stripe_binding_remote_idx").on(
			t.connectionId,
			t.resourceKind,
			t.remoteId,
		),
	],
);
export type StripeBinding = typeof stripeBindings.$inferSelect;
export interface CheckoutProjection {
	bindingId: string;
	remoteId: string;
	status: "open" | "complete" | "expired" | "unknown";
	paymentStatus: "paid" | "unpaid" | "no_payment_required" | "unknown";
	currency: string | null;
	amountTotal: number | null;
	checkoutUrl: string | null;
	sourceUpdatedAt: string | null;
	syncedAt: string;
}
export interface PaymentProjection {
	bindingId: string;
	remoteId: string;
	status:
		| "requires_payment_method"
		| "requires_confirmation"
		| "requires_action"
		| "processing"
		| "requires_capture"
		| "canceled"
		| "succeeded"
		| "unknown";
	currency: string | null;
	amount: number | null;
	amountReceived: number | null;
	sourceUpdatedAt: string | null;
	syncedAt: string;
}
export const stripeProjections = pgTable("stripe_projection", {
	bindingId: uuid("binding_id")
		.primaryKey()
		.references(() => stripeBindings.id),
	checkout: jsonb("checkout").$type<CheckoutProjection>(),
	payment: jsonb("payment").$type<PaymentProjection>(),
	syncedAt: time("synced_at").notNull(),
});
export type OperationKind =
	| "create_checkout"
	| "reconcile_checkout"
	| "reconcile_payment";
export type OperationStatus =
	| "queued"
	| "dispatching"
	| "succeeded"
	| "failed"
	| "reconciliation_required"
	| "cancelled";
export interface FrozenIntent {
	expectedCurrency: string;
	accountId: string;
	mode: "test" | "live";
	params: {
		mode: "payment";
		customer: string;
		line_items: { price: string; quantity: number }[];
		success_url: string;
		cancel_url: string;
		automatic_tax: { enabled: false };
		allow_promotion_codes: false;
		billing_address_collection: "auto";
	};
}
export const stripeOperations = pgTable(
	"stripe_operation",
	{
		id: uuid("id").primaryKey(),
		scopeKind: varchar("scope_kind", { length: 6 })
			.$type<"user" | "tenant">()
			.notNull(),
		scopeId: varchar("scope_id", { length: 128 }).notNull(),
		actorUserId: varchar("actor_user_id", { length: 128 }).notNull(),
		connectionId: varchar("connection_id", { length: 64 }).notNull(),
		kind: varchar("kind", { length: 24 }).$type<OperationKind>().notNull(),
		callerKey: varchar("caller_key", { length: 128 }).notNull(),
		digest: varchar("digest", { length: 64 }).notNull(),
		bindingId: uuid("binding_id").references(() => stripeBindings.id),
		sourceBindingId: uuid("source_binding_id")
			.notNull()
			.references(() => stripeBindings.id),
		status: varchar("status", { length: 24 })
			.$type<OperationStatus>()
			.notNull(),
		intent: jsonb("intent").$type<FrozenIntent>(),
		checkoutRemoteId: varchar("checkout_remote_id", { length: 128 }),
		createdAt: time("created_at").notNull(),
		updatedAt: time("updated_at").notNull(),
		firstDispatchAt: time("first_dispatch_at"),
		attemptToken: uuid("attempt_token"),
		leaseUntil: time("lease_until"),
		revision: integer("revision").default(0).notNull(),
		errorCode: varchar("error_code", { length: 32 }).$type<ErrorCode>(),
	},
	(t) => [
		uniqueIndex("stripe_operation_key_idx").on(
			t.scopeKind,
			t.scopeId,
			t.connectionId,
			t.kind,
			t.callerKey,
		),
		index("stripe_operation_recovery_idx").on(t.status, t.leaseUntil),
	],
);
export const stripeInbox = pgTable(
	"stripe_inbox",
	{
		id: uuid("id").primaryKey(),
		connectionId: varchar("connection_id", { length: 64 }).notNull(),
		accountId: varchar("account_id", { length: 128 }).notNull(),
		mode: varchar("mode", { length: 4 }).$type<"test" | "live">().notNull(),
		eventId: varchar("event_id", { length: 128 }).notNull(),
		bodySHA256: varchar("body_sha256", { length: 64 }).notNull(),
		eventType: text("event_type").notNull(),
		bindingId: uuid("binding_id").references(() => stripeBindings.id),
		remoteHint: varchar("remote_hint", { length: 128 }),
		state: varchar("state", { length: 12 })
			.$type<"received" | "processing" | "processed" | "ignored" | "failed">()
			.notNull(),
		receivedAt: time("received_at").notNull(),
		updatedAt: time("updated_at").notNull(),
		revision: integer("revision").default(0).notNull(),
		attemptToken: uuid("attempt_token"),
		leaseUntil: time("lease_until"),
		errorCode: varchar("error_code", { length: 32 }).$type<ErrorCode>(),
	},
	(t) => [
		uniqueIndex("stripe_inbox_receipt_idx").on(t.accountId, t.mode, t.eventId),
		index("stripe_inbox_recovery_idx").on(t.state, t.leaseUntil),
	],
);
