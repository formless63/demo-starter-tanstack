import "@tanstack/react-start/server-only";
import { inspect } from "node:util";
import {
	AbortError,
	ClientClosedError,
	ClientOfflineError,
	ConnectionTimeoutError,
	SocketClosedUnexpectedlyError,
	SocketTimeoutError,
	TimeoutError,
} from "redis";
export type CacheErrorCode =
	| "configuration"
	| "closed"
	| "timeout"
	| "authentication"
	| "unavailable"
	| "invalid-input"
	| "callback-failed";
const messages: Record<CacheErrorCode, string> = {
	configuration: "Cache configuration is incomplete or invalid",
	closed: "Cache is closed",
	timeout: "Cache operation timed out",
	authentication: "Cache authentication failed",
	unavailable: "Cache is unavailable",
	"invalid-input": "Cache input is invalid",
	"callback-failed": "Cache callback failed",
};
// The original cause is deliberately non-enumerable and never public/log input.
export class CacheError extends Error {
	constructor(
		public readonly code: CacheErrorCode,
		cause?: unknown,
	) {
		super(messages[code], { cause });
		this.name = "CacheError";
	}
	toJSON() {
		return { code: this.code, message: this.message };
	}
	[inspect.custom]() {
		return this.toJSON();
	}
}
export function invalid(condition: unknown): asserts condition {
	if (!condition) throw new CacheError("invalid-input");
}
export function cacheError(error: unknown): CacheError {
	if (error instanceof CacheError) return error;
	const value = error as
		| { code?: string; name?: string; message?: string }
		| undefined;
	const message = value?.message ?? "";
	// Inspect only to classify; none of these strings leave this server boundary.
	let code: CacheErrorCode = "unavailable";
	if (/^(?:WRONGPASS|NOAUTH|NOPERM)\b/.test(message)) code = "authentication";
	else if (
		error instanceof TimeoutError ||
		error instanceof ConnectionTimeoutError ||
		error instanceof SocketTimeoutError ||
		error instanceof AbortError ||
		/Timeout|AbortError/.test(value?.name ?? "") ||
		value?.code === "ETIMEDOUT"
	)
		code = "timeout";
	else if (
		/^(?:WRONGTYPE|ERR value is not an integer|ERR increment|ERR cache integer)\b/.test(
			message,
		)
	)
		code = "invalid-input";
	else if (
		error instanceof ClientClosedError ||
		error instanceof ClientOfflineError ||
		error instanceof SocketClosedUnexpectedlyError ||
		/^(?:LOADING|BUSY|OOM|READONLY|MASTERDOWN|CLUSTERDOWN|TRYAGAIN)\b/.test(
			message,
		) ||
		["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "EPIPE"].includes(
			value?.code ?? "",
		) ||
		/SocketClosed|ClientClosed|ClientOffline/.test(value?.name ?? "")
	)
		code = "unavailable";
	return new CacheError(code, error);
}
