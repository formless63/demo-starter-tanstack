import { db } from "../db";
import { createTransferJobs } from "../integrations/import-export/jobs.server";
import { createTransferRegistry } from "../integrations/import-export/registry.server";
import { createTransfers } from "../integrations/import-export/service.server";
import {
	getJobsClient,
	sendJobInTransaction,
} from "../integrations/jobs/client.server";
import { getStorage } from "../integrations/storage/storage.server";
// Register reviewed application definitions and resolve current scope permission here.
export const applicationTransfers = createTransfers({
	db,
	registry: createTransferRegistry([]),
	storage: getStorage,
	jobs: () => getJobsClient(),
	enqueue: (tx, transferId) =>
		sendJobInTransaction(tx, "import-export.run", { transferId }),
});
export const referenceTransferJobs = createTransferJobs((id, attempt) =>
	applicationTransfers.run(id, attempt),
);
