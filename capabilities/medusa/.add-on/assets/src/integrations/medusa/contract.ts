import { z } from "zod";
export const hasControls = (v: string) =>
	Array.from(v).some((c) => {
		const n = c.charCodeAt(0);
		return n < 32 || (n >= 127 && n <= 159);
	});
export const opaqueId = z
	.string()
	.min(1)
	.max(128)
	.refine(
		(v) =>
			!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
				v,
			) && !hasControls(v),
	);
export const uuid = z
	.string()
	.regex(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
	);
export const connectionId = z
	.string()
	.max(64)
	.regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
export const resourceKind = z.enum(["product", "order"]);
export type ResourceKind = z.infer<typeof resourceKind>;
export const scopeSchema = z.strictObject({
	kind: z.enum(["user", "tenant"]),
	id: opaqueId,
});
export type Scope = z.infer<typeof scopeSchema>;
export type TrustedContext = {
	actorUserId: string;
	scope: Scope;
	signal?: AbortSignal;
};
export const bindingRef = z.strictObject({ bindingId: uuid });
export const reconcileInput = z.strictObject({
	kind: resourceKind,
	bindingId: uuid,
});
export const listInput = z.strictObject({
	limit: z.number().int().min(1).max(100).default(25),
	cursor: z.string().max(2048).optional(),
});
export const syncInput = listInput.extend({ kind: resourceKind });
export const operationRef = z.strictObject({ operationId: uuid });
export const bridgeEvent = z
	.strictObject({
		version: z.literal(1),
		id: uuid,
		type: z.enum([
			"product.created",
			"product.updated",
			"product.deleted",
			"order.placed",
		]),
		resourceKind,
		resourceId: opaqueId,
	})
	.refine(
		(e) =>
			e.resourceKind === (e.type.startsWith("product.") ? "product" : "order"),
	);
export type BridgeEvent = z.infer<typeof bridgeEvent>;
export const errors = {
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
export type ErrorCode = keyof typeof errors;
export class MedusaError extends Error {
	constructor(readonly code: ErrorCode) {
		super(errors[code][1]);
		this.name = "MedusaError";
	}
	get status() {
		return errors[this.code][0];
	}
	get safe() {
		return {
			code: this.code,
			message: errors[this.code][1],
			retryable: errors[this.code][2],
		};
	}
}
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
	const r = schema.safeParse(value);
	if (!r.success) throw new MedusaError("invalid_input");
	return r.data;
}
export function checkSignal(signal?: AbortSignal) {
	if (!signal?.aborted) return;
	throw new MedusaError(
		signal.reason instanceof DOMException &&
			signal.reason.name === "TimeoutError"
			? "deadline_exceeded"
			: "cancelled",
	);
}
export function withSignal<T>(
	promise: Promise<T>,
	signal: AbortSignal,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const abort = () => {
			try {
				checkSignal(signal);
			} catch (e) {
				reject(e);
			}
		};
		signal.addEventListener("abort", abort, { once: true });
		promise.then(
			(v) => {
				signal.removeEventListener("abort", abort);
				if (signal.aborted) abort();
				else resolve(v);
			},
			(e) => {
				signal.removeEventListener("abort", abort);
				reject(e);
			},
		);
		if (signal.aborted) abort();
	});
}
export function safeError(error: unknown) {
	return error instanceof MedusaError ? error : new MedusaError("unavailable");
}
function decode(cursor: string): unknown {
	try {
		if (!/^[A-Za-z0-9_-]{1,2048}$/.test(cursor)) throw 0;
		const b = Buffer.from(cursor, "base64url");
		if (b.toString("base64url") !== cursor) throw 0;
		const text = new TextDecoder("utf-8", { fatal: true }).decode(b);
		const value = JSON.parse(text);
		if (JSON.stringify(value) !== text) throw 0;
		return value;
	} catch {
		throw new MedusaError("invalid_input");
	}
}
export function localCursor(cursor?: string): [1, string, string] | null {
	if (!cursor) return null;
	const v = parse(z.tuple([z.literal(1), z.string(), uuid]), decode(cursor));
	if (
		!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v[1]) ||
		!Number.isFinite(Date.parse(v[1])) ||
		new Date(v[1]).toISOString() !== v[1]
	)
		throw new MedusaError("invalid_input");
	return v;
}
export function pageCursor(
	cursor: string | undefined,
	kind: ResourceKind,
	connection: string,
) {
	if (!cursor) return 0;
	const v = parse(
		z.tuple([
			z.literal(1),
			resourceKind,
			connectionId,
			z.number().int().nonnegative().refine(Number.isSafeInteger),
		]),
		decode(cursor),
	);
	if (v[1] !== kind || v[2] !== connection)
		throw new MedusaError("invalid_input");
	return v[3];
}
export const encodeCursor = (tuple: unknown[]) =>
	Buffer.from(JSON.stringify(tuple)).toString("base64url");
export function publicResponse(value: unknown, status = 200) {
	const body = JSON.stringify(value);
	if (Buffer.byteLength(body) > 256 * 1024)
		throw new MedusaError("limit_exceeded");
	return new Response(body, {
		status,
		headers: {
			"content-type": "application/json",
			"cache-control": "no-store",
		},
	});
}
