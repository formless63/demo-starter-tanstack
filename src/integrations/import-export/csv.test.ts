import { Readable } from "node:stream";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { transferConfig } from "./config.server";
import {
	boundedBody,
	exportCsv,
	parseImport,
	spreadsheetSafe,
} from "./csv.server";
import { TransferError } from "./validation";

const config = transferConfig({});
const schema = z.object({
	name: z.string().trim().min(1).max(120),
	description: z
		.string()
		.trim()
		.max(1000)
		.transform((v) => v || null),
});
const csv = (text: string) =>
	parseImport(Buffer.from(text), ["name", "description"], schema, config);
describe("CSV fixed v1 contract", () => {
	test("BOM, CRLF, quoted newline/quote, header only", () => {
		expect(csv('\ufeffname,description\r\n"one","line\n""two"""\r\n')).toEqual([
			{ name: "one", description: 'line\n"two"' },
		]);
		expect(csv("name,description\n")).toEqual([]);
	});
	test("reject headers, prototype names, counts, blank records and fatal UTF8", () => {
		for (const value of [
			"name,name\na,b\n",
			"description,name\na,b",
			"name,description\na,b,c",
			"name,description\n\n",
			"__proto__,description\na,b",
			'name,description\n"unterminated',
		])
			expect(() => csv(value)).toThrow(TransferError);
		expect(() =>
			parseImport(
				Uint8Array.from([0xff]),
				["name", "description"],
				schema,
				config,
			),
		).toThrow(TransferError);
	});
	test("byte, row, column, field and logical bounds", () => {
		expect(() =>
			parseImport(Buffer.alloc(1025), ["name"], z.any(), {
				...config,
				maxBytes: 1024,
			}),
		).toThrow("limit");
		expect(() =>
			parseImport(
				Buffer.from("name,description\na,b\nc,d"),
				["name", "description"],
				schema,
				{ ...config, maxRows: 1 },
			),
		).toThrow("limit");
		expect(() =>
			csv("name,description\n" + Array(65).fill("x").join(",")),
		).toThrow("limit");
		expect(() =>
			csv('name,description\n"' + "x".repeat(65537) + '",d'),
		).toThrow("limit");
		expect(() =>
			parseImport(
				Buffer.from("a,b,c,d,e\n" + Array(5).fill("x".repeat(60000)).join(",")),
				["a", "b", "c", "d", "e"],
				z.any(),
				config,
			),
		).toThrow("limit");
	});
	test("validation issues never contain cells and truncate at100", () => {
		try {
			csv("name,description\n" + Array(101).fill(",private-cell").join("\n"));
			throw new Error("expected failure");
		} catch (e) {
			expect(e).toBeInstanceOf(TransferError);
			const error = e as TransferError;
			expect(error.issues).toHaveLength(100);
			expect(error.errorsTruncated).toBe(true);
			expect(error.issues[0]).toEqual({
				row: 1,
				field: "name",
				code: "invalid-value",
			});
			expect(JSON.stringify(error)).not.toContain("private-cell");
		}
	});
	test("canonical formula escape including whitespace/fullwidth and typed numeric negatives", () => {
		for (const value of [
			"=x",
			"+x",
			"-x",
			"@x",
			"\tx",
			"\rx",
			"\nx",
			"  =x",
			"\u00a0＋x",
			"＝x",
			"＋x",
			"－x",
			"＠x",
		])
			expect(spreadsheetSafe(value)).toBe("'" + value);
		for (const value of ["safe", "'=x", "space safe"])
			expect(spreadsheetSafe(value)).toBe(value);
		expect(
			exportCsv(
				[[-2, "-2", true, null]],
				["a", "b", "c", "d"],
				config,
			).toString(),
		).toBe("a,b,c,d\r\n-2,'-2,true,\r\n");
		expect(() => exportCsv([[Infinity]], ["a"], config)).toThrow(TransferError);
	});
	test("split UTF8 stream hashing and bounded cancellation closes body", async () => {
		const buffer = Buffer.from("name,description\né,ok\n");
		const source = await boundedBody(
			Readable.from(Array.from(buffer, (b) => Buffer.from([b]))),
			config.maxBytes,
			new AbortController().signal,
		);
		expect(csv(source.bytes.toString())).toEqual([
			{ name: "é", description: "ok" },
		]);
		expect(source.byteCount).toBe(buffer.length);
		expect(source.hash).toMatch(/^[a-f0-9]{64}$/);
		const stream = Readable.from([Buffer.alloc(1025)]);
		await expect(
			boundedBody(stream, 1024, new AbortController().signal),
		).rejects.toThrow("limit");
		expect(stream.destroyed).toBe(true);
	});
	test("configuration strict and lazy", () => {
		expect(config.maxBytes).toBe(16777216);
		for (const raw of ["1e4", "5junk", " 60", "60.0", "-1"])
			expect(() =>
				transferConfig({ IMPORT_EXPORT_TIMEOUT_SECONDS: raw }),
			).toThrow(TransferError);
		expect(
			transferConfig({ IMPORT_EXPORT_TIMEOUT_SECONDS: "" }).timeoutSeconds,
		).toBe(60);
	});
});
