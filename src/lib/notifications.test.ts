import { afterEach, expect, it, vi } from "vitest";
import { db } from "../db";
import { notificationValues } from "../integrations/notifications/notifications.server";
import { notifyInApplication } from "./notifications.server";
import { applicationRealtime } from "./realtime-hub.server";

afterEach(() => vi.restoreAllMocks());
it("publishes only after commit and tolerates hint failure without undoing persistence", async () => {
	const input = {
		recipientId: "fixture",
		type: "fixture.created",
		title: "Fixture",
		body: "Authoritative",
	};
	const result = {
		notification: notificationValues(input),
		jobIds: [] as string[],
	};
	let commit: (value: typeof result) => void = () => {};
	let began = () => {};
	const entered = new Promise<void>((resolve) => {
		began = resolve;
	});
	vi.spyOn(db, "transaction").mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				commit = resolve;
				began();
			}),
	);
	const publish = vi.spyOn(applicationRealtime, "publish");
	const pending = notifyInApplication(input);
	await entered;
	expect(publish).not.toHaveBeenCalled();
	commit(result);
	expect(await pending).toBe(result);
	expect(publish).toHaveBeenCalledWith(
		expect.any(String),
		"notifications.created",
		{ notificationId: result.notification.id },
	);
	publish.mockClear();
	vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("rollback"));
	await expect(notifyInApplication(input)).rejects.toThrow("rollback");
	expect(publish).not.toHaveBeenCalled();
	vi.spyOn(db, "transaction").mockResolvedValueOnce(result);
	publish.mockImplementationOnce(() => {
		throw new Error("Realtime unavailable");
	});
	expect(await notifyInApplication(input)).toBe(result);
});
