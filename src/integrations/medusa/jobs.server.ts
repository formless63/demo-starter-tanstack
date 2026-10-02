import { z } from "zod";
import { defineJob } from "../jobs/types";
import { uuid } from "./contract";
import type { createMedusa } from "./medusa.server";
export const medusaJobPayload = z.union([
	z.strictObject({ operationId: uuid }),
	z.strictObject({ inboxId: uuid }),
]);
export function createMedusaJobs(service: ReturnType<typeof createMedusa>) {
	return {
		"medusa.reconcile": defineJob({
			payload: medusaJobPayload,
			queue: {
				deleteAfterSeconds: 86400,
				expireInSeconds: 45,
				retryLimit: 5,
				retryDelay: 30,
				retryBackoff: true,
				retryDelayMax: 900,
			},
			handler: async (payload, ctx) => {
				const signal = AbortSignal.any([
					AbortSignal.timeout(45000),
					...(ctx ? [ctx.signal] : []),
				]);
				return "operationId" in payload
					? service.runOperation(payload.operationId, signal, ctx?.retryCount)
					: service.runInbox(payload.inboxId, signal, ctx?.retryCount);
			},
		}),
	};
}
