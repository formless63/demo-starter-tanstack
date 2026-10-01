import "@tanstack/react-start/server-only";
import { CacheError, invalid } from "./errors.server";

export function logicalName(value: string) {
	invalid(
		typeof value === "string" &&
			/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,255}$/.test(value),
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
				!parsed.search &&
				!parsed.hash &&
				/^\/(?:\d+)?$/.test(parsed.pathname || "/"),
		);
		const prefix = env.CACHE_KEY_PREFIX ?? "app:";
		invalid(/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,63}$/.test(prefix));
		return {
			url,
			prefix: prefix.endsWith(":") ? prefix : `${prefix}:`,
			ttlSeconds: boundedInteger(
				Number(env.CACHE_DEFAULT_TTL_SECONDS ?? 300),
				1,
				604800,
			),
			maxValueBytes: boundedInteger(
				Number(env.CACHE_MAX_VALUE_BYTES ?? 1048576),
				1,
				16777216,
			),
			connectTimeoutMs: boundedInteger(
				Number(env.CACHE_CONNECT_TIMEOUT_MS ?? 3000),
				100,
				10000,
			),
			commandTimeoutMs: boundedInteger(
				Number(env.CACHE_COMMAND_TIMEOUT_MS ?? 2000),
				100,
				10000,
			),
		};
	} catch (cause) {
		throw new CacheError("configuration", cause);
	}
}
