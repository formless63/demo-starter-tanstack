import { cacheError, closeCache, checkCache } from "../src/integrations/cache/cache.server";
try {
	await checkCache();
	console.info("Cache PING succeeded");
} catch (error) {
	console.error(`Cache check failed: ${cacheError(error).code}`);
	process.exitCode = 1;
} finally { await closeCache(); }
