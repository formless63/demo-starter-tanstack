import { startJobsWorker } from "../src/integrations/jobs/worker.server";
import { observeJob } from "../src/integrations/observability/http.server";
import { getLogger, initObservability, shutdownObservability } from "../src/integrations/observability/runtime.server";

initObservability({ registerSignals: false });
const boss = await startJobsWorker({ execute: observeJob });
let stopping = false;

async function stop(signal: NodeJS.Signals) {
	if (stopping) return;
	stopping = true;
	getLogger().info({ component: "jobs", signal }, "Worker stopping");
	try { await boss.stop({ graceful: true, timeout: 30_000 }); }
	finally { await shutdownObservability(); }
	getLogger().info({ component: "jobs" }, "Worker stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () => {
		void stop(signal).catch((error) => {
			getLogger().error({ err: error }, "Worker stop failed");
			process.exitCode = 1;
		});
	});
}
