import { db } from "../db";
import { createInvoiceNinjaJobs } from "../integrations/invoice-ninja/jobs.server";
import { createInvoiceNinja } from "../integrations/invoice-ninja/service.server";
import { sendJobInTransaction } from "../integrations/jobs/client.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
// Application supplies current scope, binding, callback and verified draft policies.
// Missing policy denies; installation never configures a remote provider.
export const applicationInvoiceNinja = createInvoiceNinja({
	database: db,
	enqueue: async (tx, kind, id) =>
		kind === "operation"
			? sendJobInTransaction(tx as Transaction, "invoice-ninja.operation", {
					operationId: id,
				})
			: sendJobInTransaction(tx as Transaction, "invoice-ninja.receipt", {
					inboxId: id,
				}),
});
export const referenceInvoiceNinjaJobs = createInvoiceNinjaJobs(
	applicationInvoiceNinja,
);
