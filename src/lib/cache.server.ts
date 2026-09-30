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
		.record(signal.durationMs / 1000, attributes);
	if (signal.hit !== undefined)
		meter
			.createCounter("app.cache.lookup.count")
			.add(1, { ...attributes, "app.cache.hit": signal.hit });
	if (signal.valueBytes !== undefined)
		meter
			.createHistogram("app.cache.value.size", { unit: "By" })
			.record(signal.valueBytes, attributes);
	// Only safe finite metadata, no arguments/results/raw error enter this span.
	const span = getTracer().startSpan(`app.cache.${signal.operation}`, {
		attributes,
		startTime: Date.now() - signal.durationMs,
	});
	if (signal.outcome === "failure")
		span.setStatus({ code: SpanStatusCode.ERROR });
	span.end();
	getLogger().info(
		{
			operation: signal.operation,
			outcome: signal.outcome,
			durationMs: Math.round(signal.durationMs),
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
