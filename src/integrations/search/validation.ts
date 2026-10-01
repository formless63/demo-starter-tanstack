export class SearchError extends Error {
	constructor(public readonly code: "invalid-query" | "unavailable") {
		super(
			code === "invalid-query"
				? "Invalid search request"
				: "Search unavailable",
		);
		this.name = "SearchError";
	}
}
export function invalidSearch(): never {
	throw new SearchError("invalid-query");
}
export interface SearchCursor {
	rank: string;
	updatedAt: string;
	id: string;
}
export interface SearchInput {
	query: string;
	limit: number;
	cursor?: SearchCursor;
}
function validCursor(value: unknown): value is SearchCursor {
	if (!value || typeof value !== "object") return false;
	const { rank, updatedAt, id } = value as SearchCursor;
	if (
		typeof rank !== "string" ||
		rank.length > 32 ||
		!/^(?:0|1|0\.\d*[1-9]|[1-9](?:\.\d*[1-9])?e-(?:0[1-9]|[1-9]\d{1,2}))$/.test(
			rank,
		) ||
		!Number.isFinite(Number(rank)) ||
		Number(rank) < 0 ||
		Number(rank) > 1
	)
		return false;
	// Keep six fractional digits from PostgreSQL, including sub-millisecond ties.
	if (
		typeof updatedAt !== "string" ||
		!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(updatedAt)
	)
		return false;
	const date = new Date(updatedAt);
	if (
		!Number.isFinite(date.getTime()) ||
		date.toISOString() !== `${updatedAt.slice(0, 23)}Z`
	)
		return false;
	return (
		typeof id === "string" &&
		id.length >= 1 &&
		id.length <= 256 &&
		id.trim() === id &&
		!Array.from(id).some(
			(char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
		) &&
		Buffer.from(id, "utf8").toString("utf8") === id
	);
}
export function encodeSearchCursor(cursor: SearchCursor): string {
	if (!validCursor(cursor)) invalidSearch();
	return Buffer.from(
		JSON.stringify([1, cursor.rank, cursor.updatedAt, cursor.id]),
	).toString("base64url");
}
export function decodeSearchCursor(value: unknown): SearchCursor {
	if (
		typeof value !== "string" ||
		value.length > 2048 ||
		!/^[A-Za-z0-9_-]+$/.test(value)
	)
		invalidSearch();
	try {
		const tuple: unknown = JSON.parse(
			Buffer.from(value, "base64url").toString("utf8"),
		);
		if (!Array.isArray(tuple) || tuple.length !== 4 || tuple[0] !== 1)
			invalidSearch();
		const cursor = { rank: tuple[1], updatedAt: tuple[2], id: tuple[3] };
		if (!validCursor(cursor) || encodeSearchCursor(cursor) !== value)
			invalidSearch();
		return cursor;
	} catch {
		return invalidSearch();
	}
}
export function parseSearchInput(value: unknown): SearchInput {
	if (!value || typeof value !== "object" || Array.isArray(value))
		invalidSearch();
	const input = value as Record<string, unknown>;
	if (
		Object.keys(input).some(
			(key) => !["query", "limit", "cursor"].includes(key),
		)
	)
		invalidSearch();
	if (typeof input.query !== "string") invalidSearch();
	const query = input.query.trim();
	if (
		query.length < 2 ||
		query.length > 256 ||
		Buffer.from(query, "utf8").toString("utf8") !== query ||
		query.includes("\0")
	)
		invalidSearch();
	const limit = input.limit === undefined ? 25 : input.limit;
	if (
		typeof limit !== "number" ||
		!Number.isInteger(limit) ||
		limit < 1 ||
		limit > 100
	)
		invalidSearch();
	return {
		query,
		limit,
		...(input.cursor === undefined
			? {}
			: { cursor: decodeSearchCursor(input.cursor) }),
	};
}
export interface SearchRequest {
	query: string;
	limit?: number;
	cursor?: string;
}
