import { eq } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema";
import { createInvoiceNinjaJobs } from "../integrations/invoice-ninja/jobs.server";
import {
	createInvoiceNinja,
	type Database,
} from "../integrations/invoice-ninja/service.server";

// This reference authorizes current user-owned bindings only; tenant authorization and draft policy remain application-owned.
const existingOwner = async (id: string) =>
	!!(await db.select({ id: user.id }).from(user).where(eq(user.id, id)))[0];
export const applicationInvoiceNinja = createInvoiceNinja({
	database: db,
	authorizeScope: async (actor, scope, signal) => {
		signal.throwIfAborted();
		return (
			scope.kind === "user" &&
			scope.id === actor &&
			(await existingOwner(actor))
		);
	},
	authorizeBoundResource: async (ctx, binding, signal) => {
		signal.throwIfAborted();
		return (
			ctx.scope.kind === "user" &&
			binding.scopeKind === "user" &&
			binding.scopeId === ctx.actorUserId &&
			(await existingOwner(ctx.actorUserId))
		);
	},
	authorizeReconciliation: async (binding, signal) => {
		signal.throwIfAborted();
		return (
			binding.scopeKind === "user" &&
			binding.retiredAt === null &&
			(await existingOwner(binding.scopeId))
		);
	},
	// Never guess currency from amount or organization metadata. Applications may wire a vetted currency registry.
	enqueue: async (tx: Database, kind, id) => {
		const { sendJobInTransaction } = await import(
			"../integrations/jobs/client.server"
		);
		type Tx = Parameters<typeof sendJobInTransaction>[0];
		return kind === "operation"
			? sendJobInTransaction(tx as Tx, "invoice-ninja.operation", {
					operationId: id,
				})
			: sendJobInTransaction(tx as Tx, "invoice-ninja.receipt", {
					inboxId: id,
				});
	},
});
export const referenceInvoiceNinjaJobs = createInvoiceNinjaJobs(
	applicationInvoiceNinja,
);
