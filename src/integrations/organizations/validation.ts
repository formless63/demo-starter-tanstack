export const messages = {
	configuration: "Organization configuration is invalid.",
	"invalid-input": "Organization input is invalid.",
	unauthenticated: "Authentication is required.",
	forbidden: "Organization operation is forbidden.",
	"not-found": "Organization resource was not found.",
	conflict: "Organization state conflicts with this operation.",
	"limit-exceeded": "Organization admission limit was reached.",
	expired: "Invitation has expired.",
	unsupported: "Organization operation is unsupported.",
	timeout: "Organization operation timed out.",
	unavailable: "Organization service is unavailable.",
	unknown: "Organization operation failed.",
} as const;
export type OrganizationCode = keyof typeof messages;
export class OrganizationError extends Error {
	readonly retryable: boolean;
	constructor(readonly code: OrganizationCode) {
		super(messages[code]);
		this.name = "OrganizationError";
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
function hasControl(value: string) {
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i);
		if (code <= 31 || code === 127) return true;
	}
	return false;
}
export function opaqueId(value: unknown): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > 128 ||
		hasControl(value)
	)
		throw new OrganizationError("invalid-input");
	return value;
}
export function organizationName(value: unknown): string {
	if (typeof value !== "string") throw new OrganizationError("invalid-input");
	const name = value.trim();
	if (name.length < 1 || name.length > 100 || hasControl(name))
		throw new OrganizationError("invalid-input");
	return name;
}
export function organizationSlug(value: unknown): string {
	if (typeof value !== "string") throw new OrganizationError("invalid-input");
	const slug = value.trim().toLowerCase();
	if (
		slug.length < 3 ||
		slug.length > 63 ||
		!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
	)
		throw new OrganizationError("invalid-input");
	return slug;
}
export type OrganizationRole = "owner" | "admin" | "member";
export function organizationRole(value: unknown): OrganizationRole {
	if (value !== "owner" && value !== "admin" && value !== "member")
		throw new OrganizationError("invalid-input");
	return value;
}
export function invitationEmail(value: unknown) {
	if (typeof value !== "string") throw new OrganizationError("invalid-input");
	const email = value.trim().toLowerCase();
	if (
		email.length > 254 ||
		hasControl(email) ||
		!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)
	)
		throw new OrganizationError("invalid-input");
	return email;
}
export function organizationConfig(
	source: Record<string, string | undefined> = process.env,
) {
	const integer = (name: string, fallback: number, max: number, min = 1) => {
		const raw = source[name];
		if (raw === undefined || raw === "") return fallback;
		if (!/^[1-9][0-9]*$/.test(raw))
			throw new OrganizationError("configuration");
		const n = Number(raw);
		if (!Number.isSafeInteger(n) || n < min || n > max)
			throw new OrganizationError("configuration");
		return n;
	};
	return Object.freeze({
		creationLimit: integer("ORGANIZATIONS_CREATION_LIMIT", 10, 100),
		membershipLimit: integer("ORGANIZATIONS_MEMBERSHIP_LIMIT", 100, 1000),
		invitationLimit: integer("ORGANIZATIONS_INVITATION_LIMIT", 100, 1000),
		invitationTTL: integer(
			"ORGANIZATIONS_INVITATION_TTL_SECONDS",
			172800,
			604800,
			300,
		),
	});
}
export function pageInput(input: { limit?: number; cursor?: string } = {}) {
	const limit = input.limit ?? 25;
	if (!Number.isInteger(limit) || limit < 1 || limit > 100)
		throw new OrganizationError("invalid-input");
	let cursor: { createdAt: Date; id: string } | undefined;
	if (input.cursor !== undefined) {
		try {
			const raw = input.cursor;
			if (
				typeof raw !== "string" ||
				raw.length > 2048 ||
				!/^[A-Za-z0-9_-]+$/.test(raw)
			)
				throw 0;
			const bytes = Buffer.from(raw, "base64url");
			const tuple: unknown = JSON.parse(bytes.toString("utf8"));
			if (
				!Array.isArray(tuple) ||
				tuple.length !== 3 ||
				tuple[0] !== 1 ||
				typeof tuple[1] !== "string" ||
				typeof tuple[2] !== "string"
			)
				throw 0;
			const createdAt = new Date(tuple[1]);
			if (
				createdAt.toISOString() !== tuple[1] ||
				encodeCursor({ createdAt, id: opaqueId(tuple[2]) }) !== raw
			)
				throw 0;
			cursor = { createdAt, id: tuple[2] };
		} catch {
			throw new OrganizationError("invalid-input");
		}
	}
	return { limit, cursor };
}
export function encodeCursor(row: { createdAt: Date; id: string }) {
	return Buffer.from(
		JSON.stringify([1, row.createdAt.toISOString(), row.id]),
	).toString("base64url");
}
export function normalizeOrganizationError(error: unknown): OrganizationError {
	if (error instanceof OrganizationError) return error;
	const code =
		(error as { code?: unknown; cause?: { code?: unknown } } | null)?.code ??
		(error as { cause?: { code?: unknown } } | null)?.cause?.code;
	if (code === "23505") return new OrganizationError("conflict");
	if (code === "57014" || code === "55P03")
		return new OrganizationError("timeout");
	return new OrganizationError("unavailable");
}
