import { createFileRoute } from "@tanstack/react-router";
import {
	MAX_REQUEST,
	StripeCapabilityError,
} from "#/integrations/stripe/contract";
import {
	operationDeadline,
	readBounded,
} from "#/integrations/stripe/transport.server";
import { auth } from "#/lib/auth";
import { referenceStripe } from "#/lib/stripe.server";
export const Route = createFileRoute("/api/integrations/stripe/$action")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const deadline = operationDeadline(request.signal);
				const headers = { "cache-control": "no-store" };
				try {
					if (
						request.headers.get("origin") !==
						new URL(process.env.APP_BASE_URL ?? "http://127.0.0.1:3000").origin
					)
						throw new StripeCapabilityError("forbidden");
					const session = await auth.api.getSession({
						headers: request.headers,
					});
					if (!session) throw new StripeCapabilityError("unauthenticated");
					const context = {
						actorUserId: session.user.id,
						scope: { kind: "user" as const, id: session.user.id },
						signal: deadline.signal,
					};
					const bytes = await readBounded(
						new Response(request.body),
						MAX_REQUEST,
						deadline.signal,
					);
					let input: unknown;
					try {
						input = JSON.parse(
							new TextDecoder("utf-8", { fatal: true }).decode(bytes),
						);
					} catch {
						throw new StripeCapabilityError("invalid_input");
					}
					const actions = {
						requestCheckout: referenceStripe.requestCheckout,
						getOperation: referenceStripe.getOperation,
						getCheckout: referenceStripe.getCheckout,
						requestPaymentReconciliation:
							referenceStripe.requestPaymentReconciliation,
						listPayments: referenceStripe.listPayments,
					};
					if (!Object.hasOwn(actions, params.action))
						throw new StripeCapabilityError("not_found");
					const result = await actions[params.action as keyof typeof actions](
						context,
						input,
					);
					const body = JSON.stringify(result);
					if (Buffer.byteLength(body) > MAX_REQUEST)
						throw new StripeCapabilityError("limit_exceeded");
					return new Response(body, {
						headers: { ...headers, "content-type": "application/json" },
					});
				} catch (error) {
					const safe =
						error instanceof StripeCapabilityError
							? error
							: new StripeCapabilityError("unavailable");
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
