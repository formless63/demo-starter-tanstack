import { z } from "zod";

export const apiErrorCodeSchema = z.enum([
	"bad_request",
	"unauthorized",
	"forbidden",
	"not_found",
	"validation_error",
	"rate_limited",
	"internal_error",
]);

export const apiErrorSchema = z.object({
	error: z.object({
		code: apiErrorCodeSchema,
		message: z.string(),
		details: z
			.array(z.object({ path: z.string(), message: z.string() }))
			.optional(),
	}),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export class ApiHttpError extends Error {
	constructor(
		readonly status: number,
		readonly code: ApiErrorCode,
		message: string,
		readonly details?: Array<{ path: string; message: string }>,
	) {
		super(message);
	}
}

export function apiErrorResponse(error: unknown) {
	if (error instanceof ApiHttpError) {
		return Response.json(
			apiErrorSchema.parse({
				error: {
					code: error.code,
					message: error.message,
					details: error.details,
				},
			}),
			{ status: error.status },
		);
	}

	console.error("Unexpected external API failure", error);
	return Response.json(
		apiErrorSchema.parse({
			error: {
				code: "internal_error",
				message: "The request could not be completed.",
			},
		}),
		{ status: 500 },
	);
}

export async function parseJsonBody<T>(request: Request, schema: z.ZodType<T>) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw new ApiHttpError(
			400,
			"bad_request",
			"Request body must be valid JSON.",
		);
	}
	const result = schema.safeParse(body);
	if (!result.success) {
		throw new ApiHttpError(
			422,
			"validation_error",
			"Request validation failed.",
			result.error.issues.map((issue) => ({
				path: issue.path.join("."),
				message: issue.message,
			})),
		);
	}
	return result.data;
}
