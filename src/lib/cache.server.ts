// Reference application only; reusable Cache has no Observability import.
import { SpanStatusCode } from "@opentelemetry/api";
import {
	type CacheObserver,
	cacheOperations,
	createCache,
} from "../integrations/cache/cache.server";
import {
	getLogger,
	getMeter,
	getTracer,
} from "../integrations/observability/runtime.server";

export const observeCache: CacheObserver = (signal) => {
	if (!cacheOperations.includes(signal.operation)) return;
	const attributes = {
		"app.cache.operation": signal.operation,
		"app.cache.outcome": signal.outcome,
	};
	const meter = getMeter();
	meter.createCounter("app.cache.operation.count").add(1, attributes);
	meter
		.createHistogram("app.cache.operation.duration", { unit: "s" })
		.record(signal.durationSeconds, attributes);
	if (signal.hit !== undefined)
		meter
			.createCounter("app.cache.lookup.count")
			.add(1, { ...attributes, "app.cache.hit": signal.hit });
	// Only safe finite metadata, no arguments/results/raw error enter this span.
	const span = getTracer().startSpan(`app.cache.${signal.operation}`, {
		attributes,
		startTime: Date.now() - signal.durationSeconds * 1000,
	});
	if (signal.outcome === "error")
		span.setStatus({ code: SpanStatusCode.ERROR });
	span.end();
	getLogger().info(
		{
			operation: signal.operation,
			outcome: signal.outcome,
			durationSeconds: signal.durationSeconds,
		},
		"Cache operation completed",
	);
};
let applicationCache: ReturnType<typeof createCache> | undefined;
export function getApplicationCache() {
	if (!applicationCache) {
		applicationCache = createCache({ observe: observeCache });
		for (const signal of ["SIGTERM", "SIGINT"] as const)
			process.once(signal, () => {
				void closeApplicationCache();
			});
	}
	return applicationCache;
}
export async function closeApplicationCache() {
	const cache = applicationCache;
	applicationCache = undefined;
	await cache?.close();
}
