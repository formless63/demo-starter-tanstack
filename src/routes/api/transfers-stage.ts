import { Readable } from "node:stream";
import { createFileRoute } from "@tanstack/react-router";
import { transferRequestContext } from "../../features/import-export/request.server";
import { TransferError } from "../../integrations/import-export/validation";
import { applicationTransfers } from "../../lib/import-export.server";

const statuses = {
	configuration: 503,
	unsupported: 422,
	"invalid-input": 400,
	unauthenticated: 401,
	forbidden: 403,
	"not-found": 404,
	conflict: 409,
	"limit-exceeded": 413,
	"invalid-format": 400,
	"validation-failed": 400,
	expired: 409,
	cancelled: 409,
	timeout: 504,
	unavailable: 503,
	"execution-lost": 503,
	unknown: 503,
} as const;
export const Route = createFileRoute("/api/transfers-stage")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const ctx = await transferRequestContext(request.headers);
					if (!request.body) throw new TransferError("invalid-input");
					// Filename, definition, scope and key are not accepted from the browser.
					const source = Readable.fromWeb(
						request.body as Parameters<typeof Readable.fromWeb>[0],
					);
					const transfer = await applicationTransfers.stageImport(ctx, {
						definition: "projects",
						body: source,
					});
					return Response.json({ ok: true, transfer }, { status: 201 });
				} catch (e) {
					const error =
						e instanceof TransferError ? e : new TransferError("unknown");
					return Response.json(
						{ ok: false, error: error.toJSON() },
						{ status: statuses[error.code] },
					);
				}
			},
		},
	},
});
