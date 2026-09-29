import { createDocument, type ZodOpenApiPathsObject } from "zod-openapi";
import { apiOperations } from "./projects.contracts";

export function createOpenApiDocument() {
	const operationIds = new Set<string>();
	const paths: ZodOpenApiPathsObject = {};

	for (const operation of [...apiOperations].sort((a, b) =>
		`${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`),
	)) {
		if (operationIds.has(operation.operationId)) {
			throw new Error(`Duplicate API operationId: ${operation.operationId}`);
		}
		operationIds.add(operation.operationId);

		const responses = Object.fromEntries(
			Object.entries(operation.responses)
				.sort(([left], [right]) => Number(left) - Number(right))
				.map(([status, response]) => [
					status,
					{
						description: response.description,
						...(response.schema
							? {
									content: {
										"application/json": { schema: response.schema },
									},
								}
							: {}),
					},
				]),
		);

		if (!paths[operation.path]) paths[operation.path] = {};
		const pathItem = paths[operation.path];
		pathItem[
			operation.method.toLowerCase() as Lowercase<typeof operation.method>
		] = {
			operationId: operation.operationId,
			summary: operation.summary,
			description: operation.description,
			tags: operation.tags,
			...(operation.pathParams || operation.queryParams
				? {
						requestParams: {
							...(operation.pathParams ? { path: operation.pathParams } : {}),
							...(operation.queryParams
								? { query: operation.queryParams }
								: {}),
						},
					}
				: {}),
			...(operation.requestBody
				? {
						requestBody: {
							required: true,
							content: {
								"application/json": { schema: operation.requestBody },
							},
						},
					}
				: {}),
			responses,
			security: operation.machineAuth ? [{ ApiKeyAuth: [] }] : [],
			"x-required-permissions": operation.permissions,
		};
	}

	return createDocument({
		openapi: "3.1.1",
		info: {
			title: "Launchpad API",
			version: "1.0.0",
			description: "Versioned external machine API for Launchpad applications.",
		},
		tags: [{ name: "Projects", description: "User-owned project operations." }],
		paths,
		components: {
			securitySchemes: {
				ApiKeyAuth: {
					type: "apiKey",
					in: "header",
					name: "X-API-Key",
					description:
						"A user-owned API key. Raw keys are shown only once at creation.",
				},
			},
		},
	});
}
