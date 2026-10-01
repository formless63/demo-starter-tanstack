import { describe, expect, it } from "vitest";
import {
	actionIdentifier,
	auditDate,
	createAuditActor,
	createAuditSubject,
	validateAuditMetadata,
} from "./validation";

describe("audit input safety", () => {
	it("accepts bounded extensible identities and JSON context", () => {
		expect(createAuditActor("scheduled-agent")).toEqual({
			type: "scheduled-agent",
			id: null,
		});
		expect(createAuditSubject("project", "stable-id")).toEqual({
			type: "project",
			id: "stable-id",
		});
		expect(
			validateAuditMetadata({ count: 3, ok: true, values: [null, "safe"] }),
		).toEqual({ count: 3, ok: true, values: [null, "safe"] });
	});
	it.each([
		"password",
		"hashedPassword",
		"client_secret",
		"API-Key",
		"accessToken",
		"refresh-token",
		"authorization",
		"cookie",
		"sessionToken",
		"credentials",
	])("rejects recursive sensitive key %s", (key) => {
		expect(() =>
			validateAuditMetadata({ nested: [{ [key]: "never persist" }] }),
		).toThrow("Invalid audit log input");
	});
	it("rejects non-JSON objects, nonfinite numbers, accessors, symbols, and cycles", () => {
		class CustomArray extends Array {}
		class Context {
			value = 1;
		}
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		const getter = Object.defineProperty({}, "value", {
			get() {
				throw new Error("must not invoke");
			},
			enumerable: true,
		});
		for (const value of [
			new Error("private"),
			new Context(),
			new CustomArray(),
			new Date(),
			undefined,
			NaN,
			Infinity,
			1n,
			() => 1,
			cyclic,
			getter,
			{ [Symbol("value")]: 1 },
			new Array(2),
		]) {
			expect(() => validateAuditMetadata({ value })).toThrow(
				"Invalid audit log input",
			);
		}
	});
	it("bounds bytes, keys, arrays, depth, and total nodes", () => {
		for (const value of [
			{ value: "é".repeat(4096) },
			Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, i])),
			{ values: Array(101).fill(1) },
			{ values: Array.from({ length: 100 }, () => Array(100).fill(1)) },
		]) {
			expect(() => validateAuditMetadata(value)).toThrow();
		}
		let nested: unknown = "safe";
		for (let i = 0; i < 7; i++) nested = { nested };
		expect(() => validateAuditMetadata(nested)).toThrow();
		expect(() =>
			validateAuditMetadata({ value: "x".repeat(8170) }),
		).not.toThrow();
	});
	it("validates controls, lengths, action namespaces, IDs, and times", () => {
		for (const type of ["", "User", "user\n", "x".repeat(65)])
			expect(() => createAuditActor(type)).toThrow();
		for (const id of ["", "x".repeat(257), "\u0000", "\ud800", " space "])
			expect(() => createAuditActor("user", id)).toThrow();
		for (const action of [
			"create",
			"projects.created by user",
			"x".repeat(129),
		])
			expect(() => actionIdentifier(action)).toThrow();
		expect(() => auditDate(new Date("invalid"))).toThrow();
		expect(() => validateAuditMetadata({ value: "\u0000" })).toThrow();
		expect(actionIdentifier("projects.create")).toBe("projects.create");
	});
});
