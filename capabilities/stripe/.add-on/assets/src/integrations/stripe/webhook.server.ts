import Stripe from "stripe";
import { type StripeConnection, validateConnection } from "./config.server";
import {
	API_VERSION,
	MAX_WEBHOOK,
	opaqueId,
	parse,
	StripeCapabilityError,
} from "./contract";
import { operationDeadline, readBounded } from "./transport.server";
export const supportedEvents = {
	"checkout.session.completed": "checkout",
	"checkout.session.async_payment_succeeded": "checkout",
	"checkout.session.async_payment_failed": "checkout",
	"payment_intent.succeeded": "payment",
	"payment_intent.payment_failed": "payment",
	"payment_intent.canceled": "payment",
} as const;
export interface VerifiedHint {
	eventId: string;
	type: keyof typeof supportedEvents | "unsupported";
	remoteId: string | null;
	kind: "checkout" | "payment" | null;
	bodySHA256: string;
}
/** Provider-native signature over unchanged bytes. Does not authorize a binding. */
export async function verifyStripeRequest(
	request: Request,
	connection: StripeConnection,
	now = Date.now(),
): Promise<VerifiedHint> {
	const config = validateConnection(connection);
	if (!config.webhookSecrets.length)
		throw new StripeCapabilityError("unconfigured");
	const deadline = operationDeadline(request.signal, 5_000);
	try {
		const header = request.headers.get("stripe-signature");
		if (!header) throw new StripeCapabilityError("invalid_input");
		if (Buffer.byteLength(header) > 8192)
			throw new StripeCapabilityError("limit_exceeded");
		const timestamps = header.split(",").filter((s) => s.startsWith("t="));
		if (timestamps.length !== 1 || !/^t=[0-9]+$/.test(timestamps[0]))
			throw new StripeCapabilityError("invalid_input");
		const timestamp = Number(timestamps[0].slice(2));
		if (
			!Number.isSafeInteger(timestamp) ||
			Math.abs(now / 1000 - timestamp) > 300
		)
			throw new StripeCapabilityError("invalid_input");
		const bytes = await readBounded(
			new Response(request.body),
			MAX_WEBHOOK,
			deadline.signal,
		);
		const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		const verifier = new Stripe(config.secretKey, {
			apiVersion: API_VERSION,
			telemetry: false,
			maxNetworkRetries: 0,
		});
		let event: Stripe.Event | undefined;
		for (const secret of config.webhookSecrets) {
			try {
				event = await verifier.webhooks.constructEventAsync(
					raw,
					header,
					secret,
					300,
					Stripe.createSubtleCryptoProvider(),
					now,
				);
				break;
			} catch {
				/* rotation */
			}
		}
		if (!event || event.object !== "event")
			throw new StripeCapabilityError("invalid_input");
		if (
			typeof event.livemode !== "boolean" ||
			event.livemode !== (config.mode === "live") ||
			(event.account !== undefined && event.account !== config.accountId) ||
			("context" in event && event.context != null)
		)
			throw new StripeCapabilityError("invalid_input");
		parse(opaqueId, event.id);
		const type =
			event.api_version === API_VERSION &&
			Object.hasOwn(supportedEvents, event.type)
				? (event.type as keyof typeof supportedEvents)
				: "unsupported";
		const kind = type === "unsupported" ? null : supportedEvents[type];
		const object = event.data?.object;
		if (
			kind &&
			(!object ||
				object.object !==
					(kind === "checkout" ? "checkout.session" : "payment_intent"))
		)
			throw new StripeCapabilityError("invalid_input");
		const remoteId = kind
			? parse(opaqueId, "id" in object ? object.id : undefined)
			: null;
		const digest = await crypto.subtle.digest("SHA-256", bytes);
		return {
			eventId: event.id,
			type,
			kind,
			remoteId,
			bodySHA256: Buffer.from(digest).toString("hex"),
		};
	} catch (error) {
		if (error instanceof StripeCapabilityError) throw error;
		throw new StripeCapabilityError("invalid_input");
	} finally {
		deadline.dispose();
	}
}
