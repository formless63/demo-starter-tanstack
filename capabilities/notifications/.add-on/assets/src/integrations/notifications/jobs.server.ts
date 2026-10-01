import { z } from "zod";
import { defineJob } from "../jobs/types";
import type { Notification } from "./schema";
import { NotificationError } from "./validation";
export const notificationDeliveryPayload = z.strictObject({
	notificationId: z.uuid(),
	channel: z.enum(["email", "ntfy"]),
});
export type NotificationChannel = z.infer<
	typeof notificationDeliveryPayload
>["channel"];
export interface DeliveryResult {
	outcome: "delivered" | "partial" | "permanent" | "ambiguous";
	category?: "rejected" | "not-found" | "disabled";
}
export type NotificationAdapter = (
	notification: Notification,
	context: { signal: AbortSignal },
) => Promise<DeliveryResult>;
export function createNotificationJobs(options: {
	load(id: string): Promise<Notification | null>;
	adapters: Partial<Record<NotificationChannel, NotificationAdapter>>;
}) {
	return {
		"notifications.deliver": defineJob({
			payload: notificationDeliveryPayload,
			queue: {
				retryLimit: 5,
				retryDelay: 30,
				retryBackoff: true,
				retryDelayMax: 900,
				expireInSeconds: 60,
				deleteAfterSeconds: 86400,
			},
			async handler(payload) {
				const controller = new AbortController();
				// Bound resolution/adapters inside the job's 60s expiry, including adapters that ignore abort.
				let timer: ReturnType<typeof setTimeout> | undefined;
				try {
					return await Promise.race([
						(async (): Promise<DeliveryResult> => {
							const row = await options.load(payload.notificationId);
							if (controller.signal.aborted)
								throw new NotificationError("unavailable", true);
							if (!row) return { outcome: "permanent", category: "not-found" };
							const adapter = options.adapters[payload.channel];
							if (!adapter)
								return { outcome: "permanent", category: "disabled" };
							return adapter(row, { signal: controller.signal });
						})(),
						new Promise<never>((_, reject) => {
							timer = setTimeout(() => {
								controller.abort();
								reject(new NotificationError("unavailable", true));
							}, 55000);
						}),
					]);
				} catch (error) {
					if (error instanceof NotificationError && !error.retryable)
						return { outcome: "permanent", category: "rejected" };
					throw new NotificationError("unavailable", true);
				} finally {
					clearTimeout(timer);
					controller.abort();
				}
			},
		}),
	} as const;
}
