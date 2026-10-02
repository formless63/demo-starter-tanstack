import { z } from "zod";

export const PROJECT_NAME_MAX_LENGTH = 120;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 1000;

export const projectInputSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Name is required")
		.max(PROJECT_NAME_MAX_LENGTH),
	description: z
		.string()
		.trim()
		.max(PROJECT_DESCRIPTION_MAX_LENGTH)
		.optional()
		.transform((value) => value || null),
});

export const projectMutationSchema = projectInputSchema.extend({
	id: z.string().uuid(),
});
export const projectIdSchema = z.object({ id: z.string().uuid() });
export type ProjectInput = z.input<typeof projectInputSchema>;
export type ProjectData = z.output<typeof projectInputSchema>;
