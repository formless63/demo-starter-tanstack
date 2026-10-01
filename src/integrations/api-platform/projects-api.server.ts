import {
	findProjectsForOwner,
	insertProjectForOwner,
} from "#/features/projects/projects.server";
import { createAuditActor } from "#/integrations/audit-log/audit.server";
import { AuthorizationError } from "#/integrations/authorization/validation";
import { personalPolicyContext } from "#/lib/application-policy.server";
import type { ApiPrincipal } from "./principal.server";
import { requireApiKey } from "./principal.server";
import {
	createProjectOperation,
	listProjectsOperation,
	projectCreateResponseApiSchema,
	projectListApiSchema,
} from "./projects.contracts";
import { ApiHttpError, apiErrorResponse, parseJsonBody } from "./responses";

function policyError(error: unknown) {
	if (!(error instanceof AuthorizationError)) return error;
	const status =
		error.code === "unauthenticated"
			? 401
			: error.code === "forbidden"
				? 403
				: error.code === "timeout"
					? 504
					: error.code === "unavailable"
						? 503
						: 500;
	return new ApiHttpError(
		status,
		status === 401
			? "unauthorized"
			: status === 403
				? "forbidden"
				: status === 504
					? "request_timeout"
					: "internal_error",
		error.message,
	);
}
function policyContext(principal: ApiPrincipal) {
	return {
		...personalPolicyContext(principal.userId),
		credentialAllows: (action: string) =>
			principal.permissions.projects.includes(
				action === "projects.read" ? "read" : "write",
			),
	};
}
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
		const projects = await findProjectsForOwner(
			principal.userId,
			policyContext(principal),
		);
		return Response.json(
			projectListApiSchema.parse({ data: projects.map(serializeProject) }),
		);
	} catch (error) {
		return apiErrorResponse(policyError(error));
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
		const project = await insertProjectForOwner(
			principal.userId,
			data,
			createAuditActor("machine", principal.keyId),
			policyContext(principal),
		);
		return Response.json(
			projectCreateResponseApiSchema.parse({ data: serializeProject(project) }),
			{ status: 201 },
		);
	} catch (error) {
		return apiErrorResponse(policyError(error));
	}
}
