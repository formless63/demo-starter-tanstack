import type { createEmail } from "../integrations/email/email.server";
import { EmailError } from "../integrations/email/errors.server";
import type { NotificationAdapter } from "../integrations/notifications/jobs.server";
import { NotificationError } from "../integrations/notifications/validation";
/** Optional application-owned adapter; all SMTP and one-attempt semantics stay in Email. */
export function notificationEmailAdapter(options: {
	resolveEmail(
		recipientId: string,
		signal: AbortSignal,
	): Promise<string | null>;
	email(): Pick<ReturnType<typeof createEmail>, "sendEmail">;
}): NotificationAdapter {
	return async (notification, { signal }) => {
		if (signal.aborted) return { outcome: "permanent", category: "rejected" };
		let address: string | null;
		try {
			address = await options.resolveEmail(notification.recipientId, signal);
		} catch (error) {
			// Resolution cannot have delivered: preserve only explicitly safe transient failures.
			if (error instanceof NotificationError) throw error;
			throw new NotificationError("unavailable", false);
		}
		if (signal.aborted) return { outcome: "permanent", category: "rejected" };
		if (!address) return { outcome: "permanent", category: "not-found" };
		try {
			const email = options.email();
			if (signal.aborted) return { outcome: "permanent", category: "rejected" };
			const result = await email.sendEmail({
				to: [{ address }],
				subject: notification.title,
				text: notification.body,
			});
			return {
				outcome:
					result.outcome === "accepted"
						? "delivered"
						: result.outcome === "partial"
							? "partial"
							: "permanent",
			};
		} catch (error) {
			if (error instanceof EmailError) {
				// Email deliberately does not retry ambiguous acceptance/connection loss.
				if (["timeout", "connection", "unknown"].includes(error.code))
					return { outcome: "ambiguous" };
				throw new NotificationError(
					"unavailable",
					error.code === "temporary-rejection" && error.retryable,
				);
			}
			return { outcome: "ambiguous" };
		}
	};
}
