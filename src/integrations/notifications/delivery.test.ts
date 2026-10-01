import { expect, it, vi } from "vitest";
import {
	createNotificationJobs,
	type NotificationAdapter,
} from "./jobs.server";
import { notificationValues } from "./notifications.server";
import { NotificationError } from "./validation";
import { notificationEmailAdapter } from "../../lib/notification-email.server";
import { EmailError } from "../email/errors.server";
const row = notificationValues({
	recipientId: "fixture",
	type: "fixture.created",
	title: "Title",
	body: "private",
});
const payload = { notificationId: row.id, channel: "email" as const };
const deferred = <T>() => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
};
it("composes preabort and deferred record/recipient cancellation without late dispatch", async () => {
	for (const phase of ["record", "recipient"] as const) {
		const pending = deferred<typeof row | string | null>();
		const sendEmail = vi.fn().mockResolvedValue({ outcome: "accepted" });
		const load = vi.fn(async () =>
			phase === "record" ? ((await pending.promise) as typeof row) : row,
		);
		const resolveEmail = vi.fn(async () => (await pending.promise) as string);
		const adapter = notificationEmailAdapter({
			resolveEmail,
			email: () => ({ sendEmail }),
		});
		const handler = createNotificationJobs({
			load,
			adapters: { email: adapter },
		})["notifications.deliver"].handler;
		const before = new AbortController();
		before.abort();
		await handler(payload, { signal: before.signal });
		expect(load).not.toHaveBeenCalled();
		expect(resolveEmail).not.toHaveBeenCalled();
		const during = new AbortController();
		const result = handler(payload, { signal: during.signal });
		await Promise.resolve();
		during.abort();
		expect((await result).category).toBe("rejected");
		pending.resolve(phase === "record" ? row : "private@example.test");
		await Promise.resolve();
		await Promise.resolve();
		expect(sendEmail).not.toHaveBeenCalled();
	}
});
it("bounds never-resolving lookup and late successful delivery without retry", async () => {
	vi.useFakeTimers();
	try {
		for (const phase of ["lookup", "adapter"] as const) {
			const pending = deferred<typeof row>();
			const adapter = vi.fn(async () => {
				await pending.promise;
				return { outcome: "delivered" as const };
			});
			const handler = createNotificationJobs({
				load: async () => (phase === "lookup" ? pending.promise : row),
				adapters: { email: adapter },
			})["notifications.deliver"].handler;
			const result = handler(payload);
			await vi.advanceTimersByTimeAsync(55000);
			expect(await result).toEqual({
				outcome: phase === "lookup" ? "permanent" : "ambiguous",
				category: "rejected",
			});
			pending.resolve(row);
			await vi.advanceTimersByTimeAsync(1);
			expect(adapter).toHaveBeenCalledTimes(phase === "lookup" ? 0 : 1);
		}
	} finally {
		vi.useRealTimers();
	}
});
it("retries only explicit safe failure and persists finite allowlisted output", async () => {
	const run = (email: NotificationAdapter) =>
		createNotificationJobs({ load: async () => row, adapters: { email } })[
			"notifications.deliver"
		].handler(payload);
	await expect(
		run(async () => {
			throw new Error("accepted then lost response/private");
		}),
	).resolves.toEqual({ outcome: "ambiguous", category: "rejected" });
	await expect(
		run(async () => {
			throw new NotificationError("unavailable", true);
		}),
	).rejects.toMatchObject({
		retryable: true,
		message: "Notifications unavailable",
	});
	await expect(
		run(async () => ({
			outcome: "delivered",
			recipient: "private",
			body: "private",
			topic: "private",
			providerResponse: "private",
		})),
	).resolves.toEqual({ outcome: "delivered" });
	for (const failure of [
		new EmailError("timeout", false),
		new EmailError("connection", false),
		new EmailError("unknown", false),
		new Error("private"),
	]) {
		await expect(
			run(
				notificationEmailAdapter({
					resolveEmail: async () => "private@example.test",
					email: () => ({
						sendEmail: async () => {
							throw failure;
						},
					}),
				}),
			),
		).resolves.toEqual({ outcome: "ambiguous" });
	}
	await expect(
		run(
			notificationEmailAdapter({
				resolveEmail: async () => "private@example.test",
				email: () => ({
					sendEmail: async () => {
						throw new EmailError("temporary-rejection", true);
					},
				}),
			}),
		),
	).rejects.toMatchObject({ retryable: true });
});
