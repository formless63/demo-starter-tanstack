import "@tanstack/react-start/server-only";
import { CacheError, invalid } from "./errors.server";

export function logicalName(value: string) {
	invalid(
		typeof value === "string" &&
			/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,255}$/.test(value) &&
			!value.split("/").some((part) => !part || part === "." || part === ".."),
	);
	return value;
}
export function boundedInteger(value: number, min: number, max: number) {
	invalid(Number.isSafeInteger(value) && value >= min && value <= max);
	return value;
}
export function cacheConfig(env: NodeJS.ProcessEnv = process.env) {
	try {
		const url = env.CACHE_URL;
		if (!url) throw new Error();
		const parsed = new URL(url);
		invalid(
			["redis:", "rediss:"].includes(parsed.protocol) &&
				!!parsed.hostname &&
				(!parsed.port || Number(parsed.port) > 0) &&
				!url.includes("?") &&
				!url.includes("#") &&
				!parsed.search &&
				!parsed.hash &&
				/^\/(?:\d+)?$/.test(parsed.pathname || "/"),
		);
		const prefix = env.CACHE_KEY_PREFIX ?? "app";
		invalid(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(prefix));
		return {
			url,
			prefix,
			ttlSeconds: boundedInteger(
				Number(env.CACHE_DEFAULT_TTL_SECONDS ?? 300),
				1,
				86400,
			),
			maxValueBytes: boundedInteger(
				Number(env.CACHE_MAX_VALUE_BYTES ?? 1048576),
				1,
				1048576,
			),
			connectTimeoutMs: 2000,
			commandTimeoutMs: 5000,
		};
	} catch (cause) {
		throw new CacheError("configuration", cause);
	}
}
