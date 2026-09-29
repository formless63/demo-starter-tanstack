import type { z } from "zod";
import { handleStarterEcho, starterEchoPayload } from "./tasks/starter-echo";
import { defineJob } from "./types";

export const jobRegistry = {
	"starter.echo": defineJob({
		payload: starterEchoPayload,
		queue: {
			deleteAfterSeconds: 86_400,
			expireInSeconds: 60,
			retryDelay: 1,
			retryLimit: 0,
		},
		handler: handleStarterEcho,
	}),
} as const;

export type JobName = keyof typeof jobRegistry;
export type JobPayload<TName extends JobName> = z.input<
	(typeof jobRegistry)[TName]["payload"]
>;

export function parseJobPayload<TName extends JobName>(
	name: TName,
	payload: unknown,
) {
	return jobRegistry[name].payload.parse(payload) as Parameters<
		(typeof jobRegistry)[TName]["handler"]
	>[0];
}
