import { createServerFn } from "@tanstack/react-start";
import {
	projectIdSchema,
	projectInputSchema,
	projectMutationSchema,
} from "./project-schema";
export const getCurrentUser = createServerFn({ method: "GET" }).handler(
	async () => (await import("./projects.server")).currentUser(),
);
export const listProjects = createServerFn({ method: "GET" }).handler(
	async () => (await import("./projects.server")).findProjects(),
);
export const createProject = createServerFn({ method: "POST" })
	.validator(projectInputSchema)
	.handler(async ({ data }) =>
		(await import("./projects.server")).insertProject(data),
	);
export const updateProject = createServerFn({ method: "POST" })
	.validator(projectMutationSchema)
	.handler(async ({ data }) =>
		(await import("./projects.server")).changeProject(data),
	);
export const deleteProject = createServerFn({ method: "POST" })
	.validator(projectIdSchema)
	.handler(async ({ data }) =>
		(await import("./projects.server")).removeProject(data.id),
	);

// POST keeps raw search strings out of request URLs and access logs. Validation
// runs inside the server handler so only safe SearchError messages cross the boundary.
export const searchProjects = createServerFn({ method: "POST" })
	.validator(
		(value: import("#/integrations/search/validation").SearchRequest) => value,
	)
	.handler(async ({ data }) =>
		(await import("./projects.server")).searchProjects(data),
	);
