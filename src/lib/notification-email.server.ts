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
		const address = await options.resolveEmail(
			notification.recipientId,
			signal,
		);
		if (signal.aborted) throw new NotificationError("unavailable", true);
		if (!address) return { outcome: "permanent", category: "not-found" };
		try {
			const result = await options.email().sendEmail({
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
				if (
					!error.retryable &&
					["timeout", "connection", "unknown"].includes(error.code)
				)
					return { outcome: "ambiguous" };
				throw new NotificationError("unavailable", error.retryable);
			}
			throw new NotificationError("unavailable", true);
		}
	};
}
