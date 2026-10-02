import { z } from "zod";

export const API_VERSION = "2026-09-30.endive" as const;
export const SDK_VERSION = "23.0.0";
export const MAX_REQUEST = 256 * 1024;
export const MAX_RESPONSE = 2 * 1024 * 1024;
export const MAX_WEBHOOK = 1024 * 1024;
export const REPLAY_WINDOW = 23 * 60 * 60 * 1000;
export const uuid = z
	.string()
	.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const opaqueId = z
	.string()
	.min(1)
	.max(128)
	.refine(
		(v) =>
			!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
				v,
			) && !/\p{Cc}/u.test(v),
	);
export const connectionId = z
	.string()
	.max(64)
	.regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
export const scopeSchema = z.strictObject({
	kind: z.enum(["user", "tenant"]),
	id: opaqueId,
});
export type Scope = z.infer<typeof scopeSchema>;
export interface TrustedContext {
	actorUserId: string;
	scope: Scope;
	signal?: AbortSignal;
}
export const bindingInput = z.strictObject({ bindingId: uuid });
export const operationInput = z.strictObject({ operationId: uuid });
export const checkoutInput = z
	.strictObject({
		customerBindingId: uuid,
		idempotencyKey: z
			.string()
			.min(1)
			.max(128)
			.regex(/^[A-Za-z0-9._:-]+$/),
		items: z
			.array(
				z.strictObject({
					offerId: connectionId,
					quantity: z.number().int().min(1).max(100),
				}),
			)
			.min(1)
			.max(20),
	})
	.refine(
		(v) => new Set(v.items.map((i) => i.offerId)).size === v.items.length,
	);
export const reconciliationInput = z.strictObject({
	kind: z.enum(["checkout", "payment"]),
	bindingId: uuid,
});
export const listInput = z.strictObject({
	limit: z.number().int().min(1).max(100).default(25),
	cursor: z.string().max(2048).optional(),
});
export const errorDefinitions = {
	invalid_input: [400, "Invalid input.", false],
	unauthenticated: [401, "Authentication required.", false],
	forbidden: [403, "Access denied.", false],
	not_found: [404, "Resource not found.", false],
	conflict: [409, "Operation conflict.", false],
	limit_exceeded: [413, "Limit exceeded.", false],
	unsupported: [422, "Operation unsupported.", false],
	unconfigured: [503, "Integration is not configured.", false],
	unavailable: [503, "Integration unavailable.", true],
	deadline_exceeded: [504, "Operation deadline exceeded.", true],
	cancelled: [409, "Operation cancelled.", false],
} as const;
export type ErrorCode = keyof typeof errorDefinitions;
export class StripeCapabilityError extends Error {
	constructor(public readonly code: ErrorCode) {
		super(errorDefinitions[code][1]);
	}
	get status() {
		return errorDefinitions[this.code][0];
	}
	publicError(retryable = errorDefinitions[this.code][2]) {
		return { code: this.code, message: this.message, retryable };
	}
}
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
	const result = schema.safeParse(input);
	if (!result.success) throw new StripeCapabilityError("invalid_input");
	return result.data;
}
export function checkoutUrl(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== "string" || value.length > 2048)
		throw new StripeCapabilityError("unsupported");
	try {
		const url = new URL(value);
		if (
			url.protocol !== "https:" ||
			url.hostname !== "checkout.stripe.com" ||
			url.port ||
			url.username ||
			url.password ||
			url.hash
		)
			throw 0;
		return value;
	} catch {
		throw new StripeCapabilityError("unsupported");
	}
}
export function cursorEncode(createdAt: Date, id: string) {
	return Buffer.from(
		JSON.stringify([1, createdAt.toISOString(), parse(uuid, id)]),
	).toString("base64url");
}
export function cursorDecode(value: string): { createdAt: Date; id: string } {
	try {
		if (value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) throw 0;
		const bytes = Buffer.from(value, "base64url");
		if (bytes.toString("base64url") !== value) throw 0;
		const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		const tuple: unknown = JSON.parse(raw);
		if (
			!Array.isArray(tuple) ||
			tuple.length !== 3 ||
			tuple[0] !== 1 ||
			typeof tuple[1] !== "string"
		)
			throw 0;
		const date = new Date(tuple[1]);
		if (date.toISOString() !== tuple[1] || JSON.stringify(tuple) !== raw)
			throw 0;
		return { createdAt: date, id: parse(uuid, tuple[2]) };
	} catch {
		throw new StripeCapabilityError("invalid_input");
	}
}
export function replayAllowed(firstDispatchAt: Date, now = new Date()) {
	const age = now.getTime() - firstDispatchAt.getTime();
	return age >= 0 && age < REPLAY_WINDOW;
}
