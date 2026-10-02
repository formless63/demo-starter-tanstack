import type Stripe from "stripe";
import { checkoutUrl, StripeCapabilityError } from "./contract";
import type { CheckoutProjection, PaymentProjection } from "./schema";

function amount(v: unknown): number | null {
	if (v == null) return null;
	if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)
		throw new StripeCapabilityError("unsupported");
	return v;
}
function currency(v: unknown): string | null {
	if (v == null) return null;
	if (typeof v !== "string" || !/^[a-z]{3}$/.test(v))
		throw new StripeCapabilityError("unsupported");
	return v;
}
export function checkoutProjection(
	bindingId: string,
	state: Stripe.Checkout.Session,
	syncedAt = new Date(),
): CheckoutProjection {
	return {
		bindingId,
		remoteId: state.id,
		status: ["open", "complete", "expired"].includes(state.status ?? "")
			? (state.status as CheckoutProjection["status"])
			: "unknown",
		paymentStatus: ["paid", "unpaid", "no_payment_required"].includes(
			state.payment_status,
		)
			? (state.payment_status as CheckoutProjection["paymentStatus"])
			: "unknown",
		currency: currency(state.currency),
		amountTotal: amount(state.amount_total),
		checkoutUrl: state.status === "open" ? checkoutUrl(state.url) : null,
		sourceUpdatedAt: null,
		syncedAt: syncedAt.toISOString(),
	};
}
export function paymentProjection(
	bindingId: string,
	state: Stripe.PaymentIntent,
	syncedAt = new Date(),
): PaymentProjection {
	const statuses = [
		"requires_payment_method",
		"requires_confirmation",
		"requires_action",
		"processing",
		"requires_capture",
		"canceled",
		"succeeded",
	];
	return {
		bindingId,
		remoteId: state.id,
		status: statuses.includes(state.status)
			? (state.status as PaymentProjection["status"])
			: "unknown",
		currency: currency(state.currency),
		amount: amount(state.amount),
		amountReceived: amount(state.amount_received),
		sourceUpdatedAt: null,
		syncedAt: syncedAt.toISOString(),
	};
}
