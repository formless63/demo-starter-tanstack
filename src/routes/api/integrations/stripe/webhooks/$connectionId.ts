import { createFileRoute } from "@tanstack/react-router";
import { db } from "#/db";
import { StripeCapabilityError } from "#/integrations/stripe/contract";
import { operationDeadline } from "#/integrations/stripe/transport.server";
import { verifyStripeRequest } from "#/integrations/stripe/webhook.server";
import { referenceStripe } from "#/lib/stripe.server";
export const Route = createFileRoute(
	"/api/integrations/stripe/webhooks/$connectionId",
)({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const deadline = operationDeadline(request.signal, 5_000);
				const headers = { "cache-control": "no-store" };
				try {
					const config = await referenceStripe.connection(
						params.connectionId,
						deadline.signal,
					);
					const hint = await verifyStripeRequest(request, config);
					deadline.signal.throwIfAborted();
					const accepted = await db.transaction(async (tx) => {
						await tx.execute(
							(await import("drizzle-orm"))
								.sql`set local statement_timeout = '5s'`,
						);
						deadline.signal.throwIfAborted();
						const result = await referenceStripe.receiveInTransaction(
							tx,
							config,
							hint,
						);
						deadline.signal.throwIfAborted();
						return result;
					});
					return Response.json(accepted, { headers });
				} catch (error) {
					let safe =
						error instanceof StripeCapabilityError
							? error
							: new StripeCapabilityError("unavailable");
					if (![400, 413, 503].includes(safe.status))
						safe = new StripeCapabilityError("unavailable");
					return Response.json(
						{ error: safe.publicError() },
						{ status: safe.status, headers },
					);
				} finally {
					deadline.dispose();
				}
			},
		},
	},
});
