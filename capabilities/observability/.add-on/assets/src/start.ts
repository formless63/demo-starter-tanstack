import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { observabilityMiddleware } from "./integrations/observability/middleware";

export const startInstance = createStart(() => ({
	requestMiddleware: [
		observabilityMiddleware(),
		createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" }),
	],
}));
