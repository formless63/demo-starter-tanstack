import { eq } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema";
import { sendJobInTransaction } from "../integrations/jobs/client.server";
import { createStripeJobs } from "../integrations/stripe/jobs.server";
import {
	createStripeCapability,
	type StripeWiring,
} from "../integrations/stripe/service.server";

// Reference deliberately authorizes only current local users, never provider metadata/tenant claims.
const wiring: StripeWiring = {
	db,
	async enqueue(tx, payload) {
		await sendJobInTransaction(tx, "stripe.process", payload);
	},
	async authorizeScope(actor, scope) {
		if (scope.kind !== "user" || scope.id !== actor) return false;
		const [owner] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.id, actor));
		return !!owner;
	},
	async authorizeBoundResource(context, binding) {
		return (
			context.scope.kind === binding.scopeKind &&
			context.scope.id === binding.scopeId
		);
	},
	async authorizeReconciliation(binding, signal) {
		signal.throwIfAborted();
		if (binding.scopeKind !== "user" || binding.retiredAt) return false;
		const [owner] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.id, binding.scopeId));
		return !!owner;
	},
	// Deployment must explicitly register its existing Prices and approved redirects in trusted code.
	// An empty registry rejects all Checkout intents without provider network I/O.
	async resolveOffer() {
		return null;
	},
	async approvedRedirects() {
		return null;
	},
};
export const referenceStripe = createStripeCapability(wiring);
export const referenceStripeWorker = createStripeJobs(wiring);
export const referenceStripeJobs = referenceStripeWorker.jobs;
