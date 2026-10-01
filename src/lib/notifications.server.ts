import { eq } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema";
import {
	createNotificationJobs,
	type NotificationAdapter,
	type NotificationChannel,
} from "../integrations/notifications/jobs.server";
import type { NotificationInput } from "../integrations/notifications/notifications.server";
import { publishNtfy } from "../integrations/notifications/ntfy.server";
import { notifications } from "../integrations/notifications/schema";
import { getApplicationEmail } from "./email.server";
import { notificationEmailAdapter } from "./notification-email.server";
import { applicationRealtime, recipientChannel } from "./realtime-hub.server";

const email = notificationEmailAdapter({
	async resolveEmail(recipientId) {
		const [recipient] = await db
			.select({ email: user.email })
			.from(user)
			.where(eq(user.id, recipientId))
			.limit(1);
		return recipient?.email ?? null;
	},
	email: getApplicationEmail,
});
// Replace this application resolver with current recipient preferences. Never queued.
const ntfy: NotificationAdapter = async (notification, { signal }) => {
	if (
		notification.recipientId !== process.env.NTFY_REFERENCE_RECIPIENT_ID ||
		!process.env.NTFY_REFERENCE_TOPIC
	)
		return { outcome: "permanent", category: "disabled" };
	return publishNtfy(notification, process.env.NTFY_REFERENCE_TOPIC, {
		signal,
	});
};
export const referenceNotificationJobs = createNotificationJobs({
	async load(id) {
		const [row] = await db
			.select()
			.from(notifications)
			.where(eq(notifications.id, id))
			.limit(1);
		return row ?? null;
	},
	adapters: { email, ntfy },
});
/** Application transaction commits before this best-effort ID-only hint. */
export async function notifyInApplication(
	input: NotificationInput,
	channels: readonly NotificationChannel[] = [],
) {
	const { createNotificationInTransaction } = await import(
		"../integrations/notifications/transaction.server"
	);
	const result = await db.transaction((tx) =>
		createNotificationInTransaction(tx, input, channels),
	);
	try {
		applicationRealtime.publish(
			recipientChannel(result.notification.recipientId),
			"notifications.created",
			{ notificationId: result.notification.id },
		);
	} catch {
		/* Persistence is already authoritative. */
	}
	return result;
}
