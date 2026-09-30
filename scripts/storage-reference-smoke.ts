import { getApplicationStorage } from "../src/lib/storage.server";
import { shutdownObservability } from "../src/integrations/observability/runtime.server";
import { storageError } from "../src/integrations/storage/errors.server";
import { storageSmoke } from "./storage-smoke";
const storage = getApplicationStorage();
try {
	await storageSmoke(storage);
	console.info("Instrumented reference Storage smoke passed");
} catch (error) {
	console.error(storageError(error).toJSON());
	process.exitCode = 1;
} finally {
	storage.close();
	await shutdownObservability();
}
