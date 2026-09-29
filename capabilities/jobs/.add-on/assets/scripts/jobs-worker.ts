import { startJobsWorker } from "../src/integrations/jobs/worker.server";

const boss = await startJobsWorker();
let stopping = false;

async function stop(signal: NodeJS.Signals) {
	if (stopping) return;
	stopping = true;
	console.info(JSON.stringify({ event: "worker.stopping", signal }));
	await boss.stop({ graceful: true, timeout: 30_000 });
	console.info(JSON.stringify({ event: "worker.stopped" }));
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () => {
		void stop(signal).catch((error) => {
			console.error(JSON.stringify({ event: "worker.stop_failed", error: String(error) }));
			process.exitCode = 1;
		});
	});
}
