import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { expect, test } from "vitest";
import { type StripeConnection, validateConnection } from "./config.server";
import {
	API_VERSION,
	checkoutInput,
	checkoutUrl,
	cursorDecode,
	cursorEncode,
	parse,
	REPLAY_WINDOW,
	replayAllowed,
	StripeCapabilityError,
} from "./contract";
import { withStripe } from "./transport.server";
import { verifyStripeRequest } from "./webhook.server";

const connection: StripeConnection = {
	id: "default",
	secretKey: "sk_test_fixture",
	accountId: "acct_fixture",
	mode: "test",
	webhookSecrets: ["whsec_current", "whsec_previous"],
};
const id = "d4e0d1aa-9f57-4cb9-a440-72ec1d2fe780";
test("closed inputs, canonical cursor and exact replay boundary", () => {
	expect(() =>
		parse(checkoutInput, {
			customerBindingId: id,
			idempotencyKey: "same",
			items: [{ offerId: "one", quantity: 1 }],
			customer: "cus_forged",
		}),
	).toThrow(StripeCapabilityError);
	expect(() =>
		parse(checkoutInput, {
			customerBindingId: id,
			idempotencyKey: "same",
			items: [
				{ offerId: "one", quantity: 1 },
				{ offerId: "one", quantity: 1 },
			],
		}),
	).toThrow();
	const date = new Date("2026-10-02T00:00:00.000Z");
	const cursor = cursorEncode(date, id);
	expect(cursorDecode(cursor)).toEqual({ createdAt: date, id });
	expect(() => cursorDecode(`${cursor}=`)).toThrow();
	expect(replayAllowed(date, new Date(+date + REPLAY_WINDOW - 1))).toBe(true);
	expect(replayAllowed(date, new Date(+date + REPLAY_WINDOW))).toBe(false);
	expect(
		checkoutUrl("https://checkout.stripe.com/c/pay/cs_fixture"),
	).toBeTruthy();
	for (const u of [
		"http://checkout.stripe.com/",
		"https://checkout.stripe.com.evil/",
		"https://user@checkout.stripe.com/",
	])
		expect(() => checkoutUrl(u)).toThrow();
});
test("configuration is lazy and rejects DNS loopback aliases and mismatched modes", () => {
	for (const endpoint of [
		"http://localhost/",
		"http://127.0.0.1.evil/",
		"https://user@api.stripe.com/",
		"https://api.stripe.com/#secret",
	])
		expect(() => validateConnection({ ...connection, endpoint })).toThrow();
	expect(
		validateConnection({ ...connection, endpoint: "http://127.0.0.1:4567/" }),
	).toBeTruthy();
	expect(() =>
		validateConnection({ ...connection, secretKey: "pk_test_fixture" }),
	).toThrow();
	expect(() => validateConnection({ ...connection, mode: "live" })).toThrow();
});
function signed(
	event: unknown,
	secret = "whsec_current",
	timestamp = Math.floor(Date.now() / 1000),
	suffix = "",
) {
	const body = JSON.stringify(event);
	const digest = createHmac("sha256", secret)
		.update(`${timestamp}.${body}`)
		.digest("hex");
	return new Request("http://127.0.0.1/webhook", {
		method: "POST",
		body,
		headers: { "stripe-signature": `t=${timestamp},v1=${digest}${suffix}` },
	});
}
const event = {
	id: "evt_fixture",
	object: "event",
	api_version: API_VERSION,
	type: "checkout.session.completed",
	livemode: false,
	data: {
		object: {
			id: "cs_fixture",
			object: "checkout.session",
			metadata: { user: "forged" },
		},
	},
};
test("native signatures, rotation, multiple v1, mode/account and absolute timestamp window", async () => {
	expect(await verifyStripeRequest(signed(event), connection)).toMatchObject({
		eventId: "evt_fixture",
		remoteId: "cs_fixture",
		kind: "checkout",
	});
	expect(
		await verifyStripeRequest(
			signed(event, "whsec_previous", undefined, ",v1=bad"),
			connection,
		),
	).toMatchObject({ eventId: "evt_fixture" });
	for (const value of [
		{ ...event, livemode: true },
		{ ...event, account: "acct_foreign" },
		{ ...event, context: "ctx_forged" },
	])
		await expect(
			verifyStripeRequest(signed(value), connection),
		).rejects.toThrow(StripeCapabilityError);
	for (const delta of [-301, 301])
		await expect(
			verifyStripeRequest(
				signed(event, undefined, Math.floor(Date.now() / 1000) + delta),
				connection,
			),
		).rejects.toThrow();
	expect(
		await verifyStripeRequest(
			signed({ ...event, api_version: "old" }),
			connection,
		),
	).toMatchObject({ type: "unsupported", remoteId: null });
	const req = signed(event);
	const body = await req.text();
	await expect(
		verifyStripeRequest(
			new Request(req.url, {
				method: "POST",
				headers: req.headers,
				body: `${body} `,
			}),
			connection,
		),
	).rejects.toThrow();
});
test("pinned SDK actual loopback form/auth/version, no retries, cancellation and response bound", async () => {
	let calls = 0;
	let seenBody = "";
	let seenHeaders: Record<string, string | string[] | undefined> = {};
	let closed = false;
	let responseMode = "normal";
	const server = createServer((req, res) => {
		calls++;
		seenHeaders = req.headers;
		let data = "";
		req.on("data", (v) => (data += v));
		req.on("end", () => {
			seenBody = data;
			res.on("close", () => {
				closed = true;
			});
			if (responseMode === "slow") {
				res.writeHead(200, { "content-type": "application/json" });
				res.write('{"id":"');
				return;
			}
			if (responseMode === "oversize") {
				res.end("x".repeat(2 * 1024 * 1024 + 1));
				return;
			}
			if (responseMode === "500") {
				res.writeHead(500, { "content-type": "application/json" });
				res.end(
					JSON.stringify({
						error: { type: "api_error", message: "private-financial-payload" },
					}),
				);
				return;
			}
			res.setHeader("content-type", "application/json");
			res.end(
				JSON.stringify({
					id: "cs_fixture",
					object: "checkout.session",
					status: "open",
					payment_status: "unpaid",
				}),
			);
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw Error("fixture");
	const config = {
		...connection,
		endpoint: `http://127.0.0.1:${address.port}/`,
	};
	try {
		await withStripe(config, undefined, (sdk) =>
			sdk.checkout.sessions.create(
				{
					mode: "payment",
					customer: "cus_fixture",
					line_items: [{ price: "price_fixture", quantity: 2 }],
					success_url: "https://app.example/success",
					cancel_url: "https://app.example/cancel",
					automatic_tax: { enabled: false },
					allow_promotion_codes: false,
					billing_address_collection: "auto",
				},
				{ idempotencyKey: `gs-stripe:${id}` },
			),
		);
		expect(calls).toBe(1);
		expect(seenHeaders.authorization).toBe("Bearer sk_test_fixture");
		expect(seenHeaders["stripe-version"]).toBe(API_VERSION);
		expect(seenHeaders["idempotency-key"]).toBe(`gs-stripe:${id}`);
		expect(seenHeaders["stripe-account"]).toBeUndefined();
		expect(new URLSearchParams(seenBody).get("line_items[0][price]")).toBe(
			"price_fixture",
		);
		responseMode = "500";
		await expect(
			withStripe(config, undefined, (sdk) =>
				sdk.checkout.sessions.retrieve("cs_fixture"),
			),
		).rejects.toMatchObject({
			code: "unavailable",
			message: "Integration unavailable.",
		});
		expect(calls).toBe(2);
		responseMode = "slow";
		const caller = new AbortController();
		const pending = withStripe(config, caller.signal, (sdk) =>
			sdk.checkout.sessions.retrieve("cs_fixture"),
		);
		setTimeout(() => caller.abort(), 80);
		await expect(pending).rejects.toMatchObject({ code: "cancelled" });
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(closed).toBe(true);
		responseMode = "oversize";
		await expect(
			withStripe(config, undefined, (sdk) =>
				sdk.checkout.sessions.retrieve("cs_fixture"),
			),
		).rejects.toThrow(StripeCapabilityError);
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});
