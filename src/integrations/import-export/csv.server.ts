import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import type { z } from "zod";
import type { TransferConfig } from "./config.server";
import {
	requireInput,
	TransferError,
	type ValidationIssue,
} from "./validation";
export function validateColumns(columns: readonly string[]) {
	requireInput(
		Array.isArray(columns) &&
			columns.length > 0 &&
			columns.length <= 64 &&
			new Set(columns).size === columns.length,
	);
	for (const c of columns)
		requireInput(
			typeof c === "string" &&
				c.length > 0 &&
				c.length <= 64 &&
				!["__proto__", "prototype", "constructor"].includes(c),
		);
}
export async function boundedBody(
	body: AsyncIterable<Uint8Array>,
	maxBytes: number,
	signal: AbortSignal,
) {
	const chunks: Buffer[] = [];
	let bytes = 0;
	const hash = createHash("sha256");
	const stream = body as AsyncIterable<Uint8Array> & {
		destroy?: (error?: Error) => void;
	};
	const abort = () => stream.destroy?.(new TransferError("cancelled"));
	signal.addEventListener("abort", abort, { once: true });
	try {
		signal.throwIfAborted();
		for await (const chunk of stream) {
			signal.throwIfAborted();
			requireInput(chunk instanceof Uint8Array);
			bytes += chunk.byteLength;
			if (bytes > maxBytes) throw new TransferError("limit-exceeded");
			hash.update(chunk);
			chunks.push(Buffer.from(chunk));
		}
		signal.throwIfAborted();
		return {
			bytes: Buffer.concat(chunks, bytes),
			byteCount: bytes,
			hash: hash.digest("hex"),
		};
	} finally {
		signal.removeEventListener("abort", abort);
		stream.destroy?.();
	}
}
// Enforce allocation bounds before invoking the parser; CSV syntax itself remains the pinned parser's responsibility.
function lexicalBounds(text: string) {
	let quoted = false;
	let field = 0;
	let row = 0;
	let columns = 1;
	for (let i = 0; i < text.length; ) {
		const c = String.fromCodePoint(text.codePointAt(i)!);
		i += c.length;
		if (c === '"') {
			if (quoted && text[i] === '"') {
				i++;
				field++;
				row += 2;
			} else quoted = !quoted;
		} else if (c === "," && !quoted) {
			field = 0;
			columns++;
			row++;
		} else if ((c === "\n" || c === "\r") && !quoted) {
			if (c === "\r" && text[i] === "\n") i++;
			field = 0;
			row = 0;
			columns = 1;
		} else {
			const bytes = Buffer.byteLength(c);
			field += bytes;
			row += bytes;
		}
		if (field > 65536 || row > 262144 || columns > 64)
			throw new TransferError("limit-exceeded");
	}
}
export function parseImport<T>(
	bytes: Uint8Array,
	columns: readonly string[],
	schema: z.ZodType<T>,
	config: TransferConfig,
) {
	validateColumns(columns);
	if (bytes.byteLength > config.maxBytes)
		throw new TransferError("limit-exceeded");
	let text: string;
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new TransferError("invalid-format");
	}
	lexicalBounds(text);
	let records: string[][];
	try {
		records = parse(text, {
			bom: true,
			columns: false,
			cast: false,
			trim: false,
			delimiter: ",",
			quote: '"',
			escape: '"',
			record_delimiter: ["\r\n", "\n"],
			max_record_size: 262144,
			skip_empty_lines: false,
		});
	} catch {
		throw new TransferError("invalid-format");
	}
	if (
		!records.length ||
		records[0].length !== columns.length ||
		records[0].some((c, i) => c !== columns[i])
	)
		throw new TransferError("invalid-format");
	if (records.length - 1 > config.maxRows)
		throw new TransferError("limit-exceeded");
	const rows: T[] = [];
	const issues: ValidationIssue[] = [];
	let count = 0;
	let normalized = 0;
	for (let i = 1; i < records.length; i++) {
		const record = records[i];
		if (
			record.length !== columns.length ||
			(record.length === 1 && record[0] === "")
		)
			throw new TransferError("invalid-format");
		const input = Object.create(null) as Record<string, string>;
		columns.forEach((c, j) => {
			input[c] = record[j];
		});
		normalized += Buffer.byteLength(JSON.stringify(input));
		if (normalized > config.maxBytes * 2)
			throw new TransferError("limit-exceeded");
		const result = schema.safeParse(input);
		if (result.success) rows.push(result.data);
		else
			for (const issue of result.error.issues) {
				count++;
				if (issues.length < 100) {
					const field =
						typeof issue.path[0] === "string" && columns.includes(issue.path[0])
							? issue.path[0]
							: undefined;
					issues.push({
						row: i,
						...(field ? { field } : {}),
						code: "invalid-value",
					});
				}
			}
	}
	if (count) throw new TransferError("validation-failed", issues, count > 100);
	return rows;
}
export function spreadsheetSafe(value: string) {
	return /^(?:[=+\-@\t\r\n＝＋－＠]|\s+[=+\-@＝＋－＠])/u.test(value)
		? `'${value}`
		: value;
}
export type ExportCell = string | number | boolean | null | undefined;
export function exportCsv(
	rows: readonly (readonly ExportCell[])[],
	columns: readonly string[],
	config: TransferConfig,
) {
	validateColumns(columns);
	if (rows.length > config.maxRows) throw new TransferError("limit-exceeded");
	let bytes = 0;
	const chunks: Buffer[] = [];
	for (const row of [columns, ...rows]) {
		if (row.length !== columns.length)
			throw new TransferError("invalid-format");
		let logical = 0;
		const cells = row.map((value) => {
			if (
				value != null &&
				typeof value !== "string" &&
				typeof value !== "boolean" &&
				!(typeof value === "number" && Number.isFinite(value))
			)
				throw new TransferError("invalid-input");
			const text =
				value == null
					? ""
					: typeof value === "string"
						? spreadsheetSafe(value)
						: String(value);
			const size = Buffer.byteLength(text);
			logical += size;
			if (size > 65536 || logical > 262144)
				throw new TransferError("limit-exceeded");
			return text;
		});
		const chunk = Buffer.from(
			stringify([cells], { record_delimiter: "\r\n", escape_formulas: false }),
		);
		bytes += chunk.length;
		if (bytes > config.maxBytes) throw new TransferError("limit-exceeded");
		chunks.push(chunk);
	}
	return Buffer.concat(chunks, bytes);
}
