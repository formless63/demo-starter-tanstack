import { checkCache } from "#/integrations/cache/cache.server";
import { cacheConfig } from "#/integrations/cache/config.server";
import type { OpsAdapter } from "#/integrations/ops-admin/ops.server";
import { storageConfig } from "#/integrations/storage/config.server";
import { inspectOpsJobs, opsJobsConfigured } from "./ops-jobs.server";
import { inspectOpsStorage } from "./ops-storage.server";

function configured(check: () => unknown) {
	try {
		check();
		return true;
	} catch {
		return false;
	}
}
// Application composition only. Removing a capability also removes its adapter/import here.
export const opsAdapters: OpsAdapter[] = [
	{
		id: "jobs",
		title: "Jobs cached counts (sample time unknown)",
		countNames: ["queued", "active", "failed"],
		isConfigured: opsJobsConfigured,
		inspect: inspectOpsJobs,
	},
	{
		id: "audit",
		title: "Audit capability present (counts omitted)",
		isConfigured: () => true,
		inspect: async () => ({ status: "ok" }),
	},
	{
		id: "webhooks",
		title: "Webhooks capability present (delivery counts included in Jobs)",
		isConfigured: () => true,
		inspect: async () => ({ status: "ok" }),
	},
	{
		id: "storage",
		title: "Private storage reachability",
		isConfigured: () => configured(() => storageConfig()),
		inspect: inspectOpsStorage,
	},
	{
		id: "cache",
		title: "Cache connection",
		isConfigured: () => configured(() => cacheConfig()),
		inspect: async () => {
			await checkCache();
			return { status: "ok" };
		},
	},
	{
		id: "observability",
		title: "Local instrumentation configuration",
		countNames: ["sdk-enabled", "export-configured"],
		isConfigured: () => true,
		inspect: async () => ({
			status: "ok",
			counts: {
				"sdk-enabled": process.env.OTEL_SDK_DISABLED === "true" ? 0 : 1,
				"export-configured":
					process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
					process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
					process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
						? 1
						: 0,
			},
		}),
	},
];
