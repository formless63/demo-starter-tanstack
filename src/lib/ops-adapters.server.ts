import { checkCache } from "#/integrations/cache/cache.server";
import type { OpsAdapter } from "#/integrations/ops-admin/ops.server";
import { checkStorage } from "#/integrations/storage/storage.server";
import { inspectOpsJobs } from "./ops-jobs.server";
// Application composition only. Removing a capability also removes its adapter/import here.
export const opsAdapters: OpsAdapter[] = [
	{
		id: "jobs",
		title: "Jobs cached counts (sample time unknown)",
		countNames: ["queued", "active", "failed"],
		isConfigured: () =>
			Boolean(process.env.PGBOSS_DATABASE_URL || process.env.DATABASE_URL),
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
		isConfigured: () => Boolean(process.env.STORAGE_BUCKET),
		inspect: async () => {
			await checkStorage();
			return { status: "ok" };
		},
	},
	{
		id: "cache",
		title: "Cache connection",
		isConfigured: () => Boolean(process.env.CACHE_URL),
		inspect: async () => {
			await checkCache();
			return { status: "ok" };
		},
	},
	{
		id: "observability",
		title: "Local instrumentation configuration",
		countNames: ["export-configured"],
		isConfigured: () => true,
		inspect: async () => ({
			status: "ok",
			counts: {
				"export-configured": process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? 1 : 0,
			},
		}),
	},
];
