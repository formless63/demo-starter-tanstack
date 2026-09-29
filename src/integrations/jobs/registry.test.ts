import { describe, expect, it } from "vitest";
import { parseJobPayload } from "./registry";

describe("job registry", () => {
	it("validates payloads at the worker boundary", () => {
		expect(parseJobPayload("starter.echo", { message: "hello" })).toEqual({
			message: "hello",
		});
		expect(() => parseJobPayload("starter.echo", { message: "" })).toThrow();
	});
});
