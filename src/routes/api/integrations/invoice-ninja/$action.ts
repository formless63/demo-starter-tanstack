import { createFileRoute } from "@tanstack/react-router";
import { InvoiceNinjaError } from "../../../../integrations/invoice-ninja/errors";
import {
	errorResponse,
	publicResponse,
	requestJson,
} from "../../../../integrations/invoice-ninja/http.server";
import { auth } from "../../../../lib/auth";
import { applicationInvoiceNinja } from "../../../../lib/invoice-ninja.server";

const actions = {
	getClient: applicationInvoiceNinja.getClient,
	getInvoice: applicationInvoiceNinja.getInvoice,
	getOperation: applicationInvoiceNinja.getOperation,
	listInvoices: applicationInvoiceNinja.listInvoices,
	requestClientReconciliation:
		applicationInvoiceNinja.requestClientReconciliation,
	requestInvoiceReconciliation:
		applicationInvoiceNinja.requestInvoiceReconciliation,
	requestDraftInvoice: applicationInvoiceNinja.requestDraftInvoice,
	cancelOperation: applicationInvoiceNinja.cancelOperation,
};
export const Route = createFileRoute("/api/integrations/invoice-ninja/$action")(
	{
		server: {
			handlers: {
				POST: async ({ request, params }) => {
					try {
						const origin = request.headers.get("Origin");
						if (!origin || origin !== new URL(request.url).origin)
							throw new InvoiceNinjaError("forbidden");
						const session = await auth.api.getSession({
							headers: request.headers,
						});
						if (!session) throw new InvoiceNinjaError("unauthenticated");
						if (!Object.hasOwn(actions, params.action))
							throw new InvoiceNinjaError("not_found");
						const input = await requestJson(request);
						const context = {
							actorUserId: session.user.id,
							scope: { kind: "user" as const, id: session.user.id },
							signal: request.signal,
						};
						return publicResponse(
							await actions[params.action as keyof typeof actions](
								context,
								input,
							),
						);
					} catch (error) {
						return errorResponse(error);
					}
				},
			},
		},
	},
);
