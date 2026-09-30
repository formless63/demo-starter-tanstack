import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { observabilityMiddleware } from "./integrations/observability/middleware";

export const startInstance = createStart(() => ({
	requestMiddleware: [
		observabilityMiddleware([
			"/",
			"/login",
			"/app",
			"/app/api-keys",
			"/api/health",
			"/api/v1/projects",
			"/api/openapi.json",
			"/docs/api",
		]),
		createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" }),
	],
}));
