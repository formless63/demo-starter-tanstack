import { connectionId, parse, StripeCapabilityError } from "./contract";
export interface StripeConnection {
	id: string;
	secretKey: string;
	accountId: string;
	mode: "test" | "live";
	webhookSecrets: readonly string[];
	endpoint?: string;
}
export function validateConnection(input: StripeConnection): StripeConnection {
	parse(connectionId, input.id);
	if (
		!/^acct_[A-Za-z0-9]+$/.test(input.accountId) ||
		!["test", "live"].includes(input.mode) ||
		!new RegExp(`^(sk|rk)_${input.mode}_[A-Za-z0-9]+$`).test(input.secretKey)
	)
		throw new StripeCapabilityError("unconfigured");
	if (input.webhookSecrets.some((s) => !/^whsec_[A-Za-z0-9]+$/.test(s)))
		throw new StripeCapabilityError("unconfigured");
	if (input.endpoint) {
		let url: URL;
		try {
			url = new URL(input.endpoint);
		} catch {
			throw new StripeCapabilityError("unconfigured");
		}
		const loopback = ["127.0.0.1", "[::1]"].includes(url.hostname);
		if (
			url.username ||
			url.password ||
			url.hash ||
			url.search ||
			url.pathname !== "/" ||
			(url.protocol !== "https:" &&
				!(
					url.protocol === "http:" &&
					process.env.NODE_ENV !== "production" &&
					loopback
				))
		)
			throw new StripeCapabilityError("unconfigured");
	}
	return input;
}
/** Lazy; calling applications explicitly assign live deployment mode. */
export function environmentConnection(): StripeConnection {
	const mode = process.env.STRIPE_MODE ?? "test";
	if (mode !== "test" && mode !== "live")
		throw new StripeCapabilityError("unconfigured");
	return validateConnection({
		id: "default",
		mode,
		secretKey: process.env.STRIPE_SECRET_KEY ?? "",
		accountId: process.env.STRIPE_ACCOUNT_ID ?? "",
		webhookSecrets: [
			process.env.STRIPE_WEBHOOK_SECRET,
			process.env.STRIPE_WEBHOOK_SECRET_PREVIOUS,
		].filter((v): v is string => !!v),
	});
}
