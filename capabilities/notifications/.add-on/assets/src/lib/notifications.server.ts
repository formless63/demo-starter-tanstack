import { eq } from "drizzle-orm";
import { db } from "../db";
import { createNotificationJobs } from "../integrations/notifications/jobs.server";
import { notifications } from "../integrations/notifications/schema";
export const referenceNotificationJobs = createNotificationJobs({
	async load(id) {
		const [row] = await db
			.select()
			.from(notifications)
			.where(eq(notifications.id, id))
			.limit(1);
		return row ?? null;
	},
	adapters: {}, // Application-owned Email/ntfy adapters; no optional capability import.
});
