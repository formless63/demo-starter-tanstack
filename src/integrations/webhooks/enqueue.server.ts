import { createHash } from "node:crypto";
import { getJobsClient } from "../jobs/client.server";
import type { WebhookDelivery } from "./delivery.server";
import { webhookDeliveryPayload } from "./jobs.server";

/** Retained pg-boss job-ID uniqueness, scoped to target + event; not permanent deduplication. */
export async function enqueueWebhook(delivery: WebhookDelivery) {
	const payload = webhookDeliveryPayload.safeParse(delivery);
	if (!payload.success) throw new Error("Invalid webhook job payload");
	const hash = createHash("sha256")
		.update(JSON.stringify([delivery.targetRef, delivery.eventId]))
		.digest("hex")
		.slice(0, 32);
	const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
	const boss = await getJobsClient();
	// Queue-level retry settings are inherited. null means an existing retained ID suppressed this insert.
	return {
		jobId: await boss.send("webhooks.deliver", payload.data, { id }),
		retainedId: id,
	};
}
