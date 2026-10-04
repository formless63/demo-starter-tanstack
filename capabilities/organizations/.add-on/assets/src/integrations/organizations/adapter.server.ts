import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { messages, normalizeOrganizationError } from "./validation";
// Decorates the official adapter's error boundary only. Native operations and
// transaction ownership remain upstream; no replay, custom transaction or raw
// endpoint invocation. Needed because native auth.api can throw driver causes
// before an after-hook runs. HTTP onAPIError alone cannot sanitize auth.api.
export function createOrganizationsDrizzleAdapter(
	db: Parameters<typeof drizzleAdapter>[0],
) {
	const factory = drizzleAdapter(db, { provider: "pg", transaction: true });
	return (...args: Parameters<typeof factory>) => {
		const adapter = factory(...args);
		return new Proxy(adapter, {
			get(target, key, receiver) {
				const original = Reflect.get(target, key, receiver);
				if (typeof original !== "function") return original;
				return async (...input: unknown[]) => {
					try {
						return await Reflect.apply(original, target, input);
					} catch (error) {
						if (error instanceof APIError) throw error;
						const safe = normalizeOrganizationError(error);
						const status =
							safe.code === "conflict"
								? "CONFLICT"
								: safe.code === "timeout"
									? "GATEWAY_TIMEOUT"
									: "SERVICE_UNAVAILABLE";
						throw new APIError(status, {
							code: safe.code,
							message: messages[safe.code],
							retryable: safe.retryable,
						});
					}
				};
			},
		});
	};
}
