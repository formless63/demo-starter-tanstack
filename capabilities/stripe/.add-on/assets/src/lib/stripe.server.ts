import { db } from "../db";
import { sendJobInTransaction } from "../integrations/jobs/client.server";
import { createStripeJobs } from "../integrations/stripe/jobs.server";
import {
	createStripeCapability,
	type StripeWiring,
} from "../integrations/stripe/service.server";

// Explicit application authorization and approved offers are required before use.
const wiring: StripeWiring = {
	db,
	async enqueue(tx, payload) {
		await sendJobInTransaction(tx, "stripe.process", payload);
	},
};
export const referenceStripe = createStripeCapability(wiring);
export const referenceStripeJobs = createStripeJobs(wiring).jobs;
