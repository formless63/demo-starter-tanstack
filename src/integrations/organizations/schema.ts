import { sql } from "drizzle-orm";
import {
	check,
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
// Better Auth owns these opaque IDs and native timestamp conventions.
export const organization = pgTable("organization", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
	logo: text("logo"),
	metadata: text("metadata"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
export const member = pgTable(
	"member",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id").notNull(),
		role: text("role").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	},
	(t) => [
		uniqueIndex("member_organization_user_idx").on(t.organizationId, t.userId),
		uniqueIndex("member_single_owner_idx")
			.on(t.organizationId)
			.where(sql`${t.role}='owner'`),
		check(
			"member_single_role_check",
			sql`${t.role} IN ('owner','admin','member')`,
		),
		index("member_user_created_idx").on(t.userId, t.createdAt, t.id),
		index("member_org_created_idx").on(t.organizationId, t.createdAt, t.id),
	],
);
export const invitation = pgTable(
	"invitation",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: text("role").notNull(),
		status: text("status").notNull(),
		inviterId: text("inviter_id").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	},
	(t) => [
		index("invitation_org_status_idx").on(
			t.organizationId,
			t.status,
			t.expiresAt,
		),
	],
);
