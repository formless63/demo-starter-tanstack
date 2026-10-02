import { validate } from "@scalar/openapi-parser";
import { describe, expect, it } from "vitest";
import { createOpenApiDocument } from "./openapi";

describe("API Platform OpenAPI document", () => {
	it("generates deterministic, valid OpenAPI 3.1.1 from registered contracts", async () => {
		const first = createOpenApiDocument();
		const second = createOpenApiDocument();
		expect(first).toEqual(second);
		expect(first.openapi).toBe("3.1.1");
		await expect(
			validate(JSON.stringify(first), { throwOnError: true }),
		).resolves.toMatchObject({
			valid: true,
		});
	});

	it("contains only deliberate external operations with unique IDs and security metadata", () => {
		const document = createOpenApiDocument();
		const paths = document.paths ?? {};
		expect(Object.keys(paths)).toEqual(["/api/v1/projects"]);
		expect(paths["/api/auth/$"]).toBeUndefined();
		expect(paths["/api/health"]).toBeUndefined();

		const operations = Object.values(paths).flatMap((path) =>
			Object.values(path).filter(
				(value): value is { operationId: string } =>
					typeof value === "object" && value !== null && "operationId" in value,
			),
		);
		const operationIds = operations.map(({ operationId }) => operationId);
		expect(new Set(operationIds).size).toBe(operationIds.length);
		expect(operationIds).toEqual(["listProjects", "createProject"]);
		expect(document.components?.securitySchemes?.ApiKeyAuth).toMatchObject({
			type: "apiKey",
			in: "header",
			name: "X-API-Key",
		});
		expect(paths["/api/v1/projects"]?.get).toMatchObject({
			security: [{ ApiKeyAuth: [] }],
			"x-required-permissions": { projects: ["read"] },
		});
		expect(paths["/api/v1/projects"]?.post).toMatchObject({
			security: [{ ApiKeyAuth: [] }],
			"x-required-permissions": { projects: ["write"] },
		});
	});
	it("publishes the same Project request bounds as runtime validation", () => {
		const document = createOpenApiDocument();
		expect(
			document.paths?.["/api/v1/projects"]?.post?.requestBody,
		).toMatchObject({
			content: {
				"application/json": {
					schema: {
						properties: {
							name: { minLength: 1, maxLength: 120 },
							description: { maxLength: 1000 },
						},
					},
				},
			},
		});
	});
});
