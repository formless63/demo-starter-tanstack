import { db } from "../db";
import { sendJobInTransaction } from "../integrations/jobs/client.server";
import { createMedusaJobs } from "../integrations/medusa/jobs.server";
import { createMedusa } from "../integrations/medusa/medusa.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
// Application supplies trusted current scope/binding/callback policies. Default denies.
export const referenceMedusa = createMedusa({
	db,
	enqueue: async (tx, payload) => {
		await sendJobInTransaction(tx as Transaction, "medusa.reconcile", payload);
	},
});
export const referenceMedusaJobs = createMedusaJobs(referenceMedusa);
