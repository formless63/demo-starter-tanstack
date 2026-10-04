import { sql } from "drizzle-orm";
import {
	check,
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
export const authorizationAssignments = pgTable(
	"authorization_assignment",
	{
		id: uuid("id").primaryKey(),
		scopeKind: text("scope_kind").notNull(),
		scopeId: text("scope_id").notNull(),
		userId: text("user_id").notNull(),
		roleId: text("role_id").notNull(),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			precision: 3,
		}).notNull(),
	},
	(t) => [
		uniqueIndex("authorization_assignment_exact_idx").on(
			t.scopeKind,
			t.scopeId,
			t.userId,
			t.roleId,
		),
		index("authorization_assignment_scope_created_idx").on(
			t.scopeKind,
			t.scopeId,
			t.createdAt,
			t.id,
		),
		check(
			"authorization_assignment_kind_check",
			sql`${t.scopeKind} IN ('user','tenant')`,
		),
	],
);
