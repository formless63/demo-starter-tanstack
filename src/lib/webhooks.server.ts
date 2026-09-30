import { z } from "zod";
import { defineWebhookEvents } from "../integrations/webhooks/events";
import { createWebhookJobs } from "../integrations/webhooks/jobs.server";

// Application-owned registration: replace with domain schemas and tenant-scoped resolver.
export const webhookEvents = defineWebhookEvents({
	"starter.ping": z.strictObject({ message: z.string().max(100) }),
});
export const referenceWebhookJobs = createWebhookJobs({
	registry: webhookEvents,
	resolveTarget(targetRef) {
		if (
			targetRef !== "reference" ||
			!process.env.WEBHOOK_REFERENCE_URL ||
			!process.env.WEBHOOK_REFERENCE_SECRET
		)
			throw new Error("Webhook target unavailable");
		return {
			url: process.env.WEBHOOK_REFERENCE_URL,
			signingSecret: process.env.WEBHOOK_REFERENCE_SECRET,
		};
	},
});
