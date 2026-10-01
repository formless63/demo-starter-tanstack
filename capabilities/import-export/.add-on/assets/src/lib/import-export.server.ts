import * as transferDatabaseSchema from "../db/schema";
import { createTransferTransactions } from "../integrations/import-export/database.server";
import { createTransferJobs } from "../integrations/import-export/jobs.server";
import { createTransferRegistry } from "../integrations/import-export/registry.server";
import { createTransfers } from "../integrations/import-export/service.server";
import { TransferError } from "../integrations/import-export/validation";
import {
	getJobsClient,
	sendJobInTransaction,
} from "../integrations/jobs/client.server";
import { getStorage } from "../integrations/storage/storage.server";
// Register reviewed application definitions and resolve current scope permission here.
export const applicationTransfers = createTransfers({
	transaction: createTransferTransactions(() => {
		if (!process.env.DATABASE_URL) throw new TransferError("configuration");
		return process.env.DATABASE_URL;
	}, transferDatabaseSchema),
	registry: createTransferRegistry([]),
	storage: getStorage,
	jobs: () => getJobsClient(),
	enqueue: (tx, transferId) =>
		sendJobInTransaction(tx, "import-export.run", { transferId }),
});
export const referenceTransferJobs = createTransferJobs((id, attempt) =>
	applicationTransfers.run(id, attempt),
);
