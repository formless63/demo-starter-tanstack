import { z } from "zod";
import { projectInputSchema } from "#/features/projects/project-schema";
import { type ApiOperation, defineApiOperation } from "./contracts";
import { apiErrorSchema } from "./responses";

export const projectApiSchema = z.object({
	id: z.uuid(),
	name: z.string(),
	description: z.string().nullable(),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
});

export const projectListApiSchema = z.object({
	data: z.array(projectApiSchema),
});
export const projectCreateApiSchema = projectInputSchema;
export const projectCreateResponseApiSchema = z.object({
	data: projectApiSchema,
});

const standardErrors = {
	400: { description: "Malformed request", schema: apiErrorSchema },
	401: { description: "Missing or invalid API key", schema: apiErrorSchema },
	403: {
		description: "Insufficient API-key permissions",
		schema: apiErrorSchema,
	},
	404: {
		description: "Requested resource was not found",
		schema: apiErrorSchema,
	},
	422: { description: "Request validation failed", schema: apiErrorSchema },
	429: { description: "API-key rate limit exceeded", schema: apiErrorSchema },
	500: { description: "Unexpected server failure", schema: apiErrorSchema },
} as const;

export const listProjectsOperation = defineApiOperation({
	method: "GET",
	path: "/api/v1/projects",
	operationId: "listProjects",
	summary: "List projects",
	description: "Lists only projects owned by the API key's user.",
	tags: ["Projects"],
	machineAuth: true,
	permissions: { projects: ["read"] },
	responses: {
		200: { description: "Owned projects", schema: projectListApiSchema },
		...standardErrors,
	},
});

export const createProjectOperation = defineApiOperation({
	method: "POST",
	path: "/api/v1/projects",
	operationId: "createProject",
	summary: "Create a project",
	description: "Creates a project owned by the API key's user.",
	tags: ["Projects"],
	requestBody: projectCreateApiSchema,
	machineAuth: true,
	permissions: { projects: ["write"] },
	responses: {
		201: {
			description: "Created project",
			schema: projectCreateResponseApiSchema,
		},
		...standardErrors,
	},
});

export const apiOperations: ApiOperation[] = [
	listProjectsOperation,
	createProjectOperation,
];
