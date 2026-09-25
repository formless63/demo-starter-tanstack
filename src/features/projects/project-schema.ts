import { z } from "zod";

export const projectInputSchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(100),
	description: z
		.string()
		.trim()
		.max(1000)
		.optional()
		.transform((value) => value || null),
});

export const projectMutationSchema = projectInputSchema.extend({
	id: z.string().uuid(),
});
export const projectIdSchema = z.object({ id: z.string().uuid() });
export type ProjectInput = z.input<typeof projectInputSchema>;
export type ProjectData = z.output<typeof projectInputSchema>;
