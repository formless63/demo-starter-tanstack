import { z } from "zod";
import type { JobHandlerContext } from "../jobs/types";
import { transferConfig } from "./config.server";
export const transferPayload = z.strictObject({ transferId: z.uuid() });
export function createTransferJobs(
	run: (id: string, attempt?: JobHandlerContext) => Promise<object>,
) {
	return {
		"import-export.run": {
			payload: transferPayload,
			queue: {
				retryLimit: 5,
				retryDelay: 30,
				retryBackoff: true,
				retryDelayMax: 900,
				get expireInSeconds() {
					return transferConfig().timeoutSeconds + 30;
				},
				deleteAfterSeconds: 86400,
			},
			handler: (
				payload: z.output<typeof transferPayload>,
				attempt?: JobHandlerContext,
			) => run(payload.transferId, attempt),
		},
	} as const;
}
