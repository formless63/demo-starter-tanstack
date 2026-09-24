import { describe, expect, it } from "vitest";
import { ownsProject } from "./project-schema";

describe("project authorization invariant", () => {
	it("rejects cross-user project access", () => {
		expect(ownsProject("owner-a", "owner-a")).toBe(true);
		expect(ownsProject("owner-a", "owner-b")).toBe(false);
	});
});
