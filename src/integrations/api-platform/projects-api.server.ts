import {
	findProjectsForOwner,
	insertProjectForOwner,
} from "#/features/projects/projects.server";
import { requireApiKey } from "./principal.server";
import {
	createProjectOperation,
	listProjectsOperation,
	projectCreateResponseApiSchema,
	projectListApiSchema,
} from "./projects.contracts";
import { apiErrorResponse, parseJsonBody } from "./responses";

function serializeProject(project: {
	id: string;
	name: string;
	description: string | null;
	createdAt: Date;
	updatedAt: Date;
}) {
	return {
		...project,
		createdAt: project.createdAt.toISOString(),
		updatedAt: project.updatedAt.toISOString(),
	};
}

export async function listProjectsApi(request: Request) {
	try {
		const principal = await requireApiKey(
			request,
			listProjectsOperation.permissions,
		);
		const projects = await findProjectsForOwner(principal.userId);
		return Response.json(
			projectListApiSchema.parse({ data: projects.map(serializeProject) }),
		);
	} catch (error) {
		return apiErrorResponse(error);
	}
}

export async function createProjectApi(request: Request) {
	try {
		const principal = await requireApiKey(
			request,
			createProjectOperation.permissions,
		);
		const data = await parseJsonBody(
			request,
			createProjectOperation.requestBody,
		);
		const project = await insertProjectForOwner(principal.userId, data);
		return Response.json(
			projectCreateResponseApiSchema.parse({ data: serializeProject(project) }),
			{ status: 201 },
		);
	} catch (error) {
		return apiErrorResponse(error);
	}
}
