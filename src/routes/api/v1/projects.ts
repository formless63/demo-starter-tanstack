import { createFileRoute } from "@tanstack/react-router";
import {
	createProjectOperation,
	listProjectsOperation,
} from "#/integrations/api-platform/projects.contracts";
import {
	createProjectApi,
	listProjectsApi,
} from "#/integrations/api-platform/projects-api.server";
import { observeApi } from "#/integrations/observability/http.server";

export const Route = createFileRoute("/api/v1/projects")({
	server: {
		handlers: {
			GET: ({ request }) =>
				observeApi(listProjectsOperation.operationId, request, () =>
					listProjectsApi(request),
				),
			POST: ({ request }) =>
				observeApi(createProjectOperation.operationId, request, () =>
					createProjectApi(request),
				),
		},
	},
});
