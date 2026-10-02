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
	it("accepts the canonical bounds after trimming and rejects either overflow", () => {
		const input = { name: "n".repeat(120), description: "d".repeat(1000) };
		expect(projectInputSchema.parse(input)).toEqual(input);
		expect(projectInputSchema.parse({ name: ` ${input.name} ` })).toEqual({
			name: input.name,
			description: null,
		});
		expect(
			projectInputSchema.safeParse({ name: "n".repeat(121) }).success,
		).toBe(false);
		expect(
			projectInputSchema.safeParse({ ...input, description: "d".repeat(1001) })
				.success,
		).toBe(false);
		expect(
			projectMutationSchema.safeParse({ ...input, id: crypto.randomUUID() })
				.success,
		).toBe(true);
	});
});
