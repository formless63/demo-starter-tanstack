import { describe, expect, it } from "vitest";
import { projectInputSchema, projectMutationSchema } from "./project-schema";

describe("project validation", () => {
	it("normalizes input and accepts an omitted description", () => {
		expect(
			projectInputSchema.parse({ name: "  Launch  ", description: "" }),
		).toEqual({ name: "Launch", description: null });
	});
	it("rejects empty names and malformed mutation ids", () => {
		expect(projectInputSchema.safeParse({ name: " " }).success).toBe(false);
		expect(
			projectMutationSchema.safeParse({
				id: "another-users-project",
				name: "Changed",
			}).success,
		).toBe(false);
	});
});
