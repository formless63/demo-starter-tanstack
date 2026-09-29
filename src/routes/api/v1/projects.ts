import { createFileRoute } from "@tanstack/react-router";
import {
	createProjectApi,
	listProjectsApi,
} from "#/integrations/api-platform/projects-api.server";

export const Route = createFileRoute("/api/v1/projects")({
	server: {
		handlers: {
			GET: ({ request }) => listProjectsApi(request),
			POST: ({ request }) => createProjectApi(request),
		},
	},
});
