import { eq } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema";
import { sendJobInTransaction } from "../integrations/jobs/client.server";
import { createMedusaJobs } from "../integrations/medusa/jobs.server";
import {
	type Binding,
	createMedusa,
} from "../integrations/medusa/medusa.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const ownerExists = async (id: string) =>
	!!(
		await db.select({ id: user.id }).from(user).where(eq(user.id, id)).limit(1)
	)[0];
// Root reference supports user scopes only. Tenant policy is intentionally absent and denied.
const owns = (actor: string, b: Binding) =>
	b.scope_kind === "user" && b.scope_id === actor;
export const referenceMedusa = createMedusa({
	db,
	enqueue: async (tx, payload) => {
		await sendJobInTransaction(tx as Transaction, "medusa.reconcile", payload);
	},
	policy: {
		authorizeScope: async (actor, scope) =>
			scope.kind === "user" && scope.id === actor && (await ownerExists(actor)),
		authorizeBoundResource: async (ctx, b) => owns(ctx.actorUserId, b),
		authorizeMedusaResource: async (ctx, b) => owns(ctx.actorUserId, b),
		authorizeReconciliation: async (b, signal) => {
			signal.throwIfAborted();
			return b.scope_kind === "user" && (await ownerExists(b.scope_id));
		},
	},
});
export const referenceMedusaJobs = createMedusaJobs(referenceMedusa);
