import { expect, it } from "vitest";
import { apiErrorResponse } from "./responses";

it("keeps unexpected failures safe in both the external envelope and fallback logs", async () => {
	const records: unknown[][] = [];
	const original = console.error;
	console.error = (...fields: unknown[]) => {
		records.push(fields);
	};
	try {
		const response = apiErrorResponse(
			new Error(
				"postgresql://user:database-secret@internal/db app_raw-key-secret",
			),
		);
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			error: {
				code: "internal_error",
				message: "The request could not be completed.",
			},
		});
		expect(JSON.stringify(records)).not.toMatch(
			/database-secret|app_raw-key-secret|internal\/db|stack/,
		);
	} finally {
		console.error = original;
	}
});
