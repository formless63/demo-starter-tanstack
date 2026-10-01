export const messages = {
	unsupported: "Transfer operation is unsupported",
	configuration: "Transfer configuration is invalid",
	"invalid-input": "Transfer input is invalid",
	unauthenticated: "Authentication is required",
	forbidden: "Transfer access was denied",
	"not-found": "Transfer was not found",
	conflict: "Transfer state conflicts with this request",
	"limit-exceeded": "Transfer limit exceeded",
	"invalid-format": "CSV format is invalid",
	"validation-failed": "CSV rows are invalid",
	expired: "Transfer artifact has expired",
	cancelled: "Transfer was cancelled",
	timeout: "Transfer deadline exceeded",
	unavailable: "Transfer dependency is unavailable",
	"execution-lost": "Transfer execution is no longer available",
	unknown: "Transfer failed",
} as const;
export type TransferErrorCode = keyof typeof messages;
export interface ValidationIssue {
	row: number;
	field?: string;
	code: "invalid-value";
}
export class TransferError extends Error {
	readonly retryable: boolean;
	constructor(
		public readonly code: TransferErrorCode,
		public readonly issues: ValidationIssue[] = [],
		public readonly errorsTruncated = false,
	) {
		super(messages[code]);
		this.name = "TransferError";
		this.retryable = code === "timeout" || code === "unavailable";
	}
	toJSON() {
		return {
			code: this.code,
			message: this.message,
			retryable: this.retryable,
		};
	}
}
export function requireInput(value: unknown): asserts value {
	if (!value) throw new TransferError("invalid-input");
}
export function opaqueId(value: unknown): asserts value is string {
	requireInput(
		typeof value === "string" &&
			value.length > 0 &&
			value.length <= 128 &&
			Array.from(value).every(
				(c) =>
					c.charCodeAt(0) > 31 &&
					(c.charCodeAt(0) < 127 || c.charCodeAt(0) > 159),
			),
	);
}
export type Scope = { kind: "user" | "tenant"; id: string };
export interface TransferContext {
	requesterId: string;
	scope: Scope;
}
export function validContext(context: TransferContext) {
	if (!context?.requesterId) throw new TransferError("unauthenticated");
	opaqueId(context.requesterId);
	opaqueId(context.scope?.id);
	requireInput(
		context.scope.kind === "user" || context.scope.kind === "tenant",
	);
	if (context.scope.kind === "user" && context.scope.id !== context.requesterId)
		throw new TransferError("forbidden");
}
export function idempotencyKey(value: unknown): asserts value is string {
	requireInput(typeof value === "string" && /^[\x20-\x7e]{1,128}$/.test(value));
}
export function transferId(value: unknown): asserts value is string {
	requireInput(
		typeof value === "string" &&
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
				value,
			),
	);
}
