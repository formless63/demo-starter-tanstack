import { checkCache } from "#/integrations/cache/cache.server";
import type { OpsAdapter } from "#/integrations/ops-admin/ops.server";
import { checkStorage } from "#/integrations/storage/storage.server";
// Application composition only. Removing a capability also removes its adapter/import here.
export const opsAdapters: OpsAdapter[] = [
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
		countNames: ["enabled"],
		isConfigured: () => true,
		inspect: async () => ({
			status: "ok",
			counts: { enabled: process.env.OTEL_ENABLED === "true" ? 1 : 0 },
		}),
	},
];
