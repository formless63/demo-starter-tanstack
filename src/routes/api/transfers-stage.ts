import { Readable } from "node:stream";
import { createFileRoute } from "@tanstack/react-router";
import { transferRequestContext } from "../../features/import-export/request.server";
import {
	TransferError,
	transferErrorStatus,
} from "../../integrations/import-export/validation";
import { applicationTransfers } from "../../lib/import-export.server";

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
					try {
						const transfer = await applicationTransfers.stageImport(ctx, {
							definition: "projects",
							body: source,
						});
						return Response.json({ ok: true, transfer }, { status: 201 });
					} finally {
						source.destroy();
					}
				} catch (e) {
					const error =
						e instanceof TransferError ? e : new TransferError("unknown");
					return Response.json(
						{ ok: false, error: error.toJSON() },
						{ status: transferErrorStatus[error.code] },
					);
				}
			},
		},
	},
});
