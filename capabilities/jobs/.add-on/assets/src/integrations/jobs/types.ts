import type { z } from "zod";

export interface JobDefinition<TSchema extends z.ZodType> {
	payload: TSchema;
	queue: {
		deleteAfterSeconds: number;
		expireInSeconds: number;
		retryDelay: number;
		retryLimit: number;
	};
	handler: (payload: z.output<TSchema>) => Promise<object>;
}

export type JobDefinitions = Record<string, JobDefinition<z.ZodType>>;

export function defineJob<TSchema extends z.ZodType>(
	definition: JobDefinition<TSchema>,
) {
	return definition;
}
