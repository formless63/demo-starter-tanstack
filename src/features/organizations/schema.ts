import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "../../integrations/organizations/schema";
// Application-owned example, deliberately separate from personal Projects.
export const organizationNotes = pgTable(
	"organization_note",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id),
		title: text("title").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("organization_note_scope_created_idx").on(
			t.organizationId,
			t.createdAt,
			t.id,
		),
	],
);
