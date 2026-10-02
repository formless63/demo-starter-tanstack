import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
export const notificationTransport = createServerFn({ method: "GET" }).handler(
	async () => {
		const { realtimeTransports } = await import(
			"../../integrations/realtime/realtime.server"
		);
		const transports = realtimeTransports();
		return transports.has("sse") ? ("sse" as const) : ("websocket" as const);
	},
);
export const listNotifications = createServerFn({ method: "GET" })
	.validator(
		z.strictObject({
			unreadOnly: z.boolean().optional(),
			type: z.string().optional(),
			limit: z.number().int().min(1).max(100).optional(),
			cursor: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const { requireUser } = await import("../projects/projects.server");
		const { db } = await import("../../db");
		const { queryNotifications } = await import(
			"../../integrations/notifications/notifications.server"
		);
		return queryNotifications(db, (await requireUser()).id, data);
	});
export const setNotificationRead = createServerFn({ method: "POST" })
	.validator(z.strictObject({ id: z.uuid(), read: z.boolean() }))
	.handler(async ({ data }) => {
		const { requireUser } = await import("../projects/projects.server");
		const { db } = await import("../../db");
		const { markRead, markUnread } = await import(
			"../../integrations/notifications/notifications.server"
		);
		return (data.read ? markRead : markUnread)(
			db,
			(await requireUser()).id,
			data.id,
		);
	});
