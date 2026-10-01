import assert from "node:assert/strict";
import { z } from "zod";
import {
	createWebhookEvent,
	defineWebhookEvents,
} from "../src/integrations/webhooks/events";
import { validateWebhookTarget } from "../src/integrations/webhooks/delivery.server";
import {
	handoffWebhookRequest,
	verifyWebhookRequest,
} from "../src/integrations/webhooks/inbound.server";
import {
	generateWebhookSecret,
	signWebhook,
	verifyWebhookSignature,
} from "../src/integrations/webhooks/protocol.server";

export async function webhooksUnit() {
	const vectorSecret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
	const vectorId = "msg_p5jXN8AQM9LWM0D4loKWxJek";
	const vectorBody = Buffer.from('{"test": 2432232314}');
	const vectorSignature = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";
	assert.equal(
		signWebhook(vectorId, 1614265330, vectorBody, vectorSecret),
		vectorSignature,
	);
	assert.equal(
		verifyWebhookSignature(
			vectorBody,
			new Headers({
				"webhook-id": vectorId,
				"webhook-timestamp": "1614265330",
				"webhook-signature": vectorSignature,
			}),
			{ secrets: [vectorSecret], now: 1614265330 },
		),
		vectorId,
	);
	const registry = defineWebhookEvents({
		"fixture.ping": z.strictObject({ message: z.string() }),
	});
	const { event, body } = createWebhookEvent(registry, "fixture.ping", {
		message: "private-body-🦀",
	});
	const secret = generateWebhookSecret();
	const previous = generateWebhookSecret();
	const now = Math.floor(Date.now() / 1000);
	const request = (
		value = body,
		key = secret,
		timestamp = now,
		headers: Record<string, string> = {},
	) =>
		new Request("https://receiver.example/webhook", {
			method: "POST",
			body: value,
			headers: {
				"webhook-id": event.id,
				"webhook-timestamp": String(timestamp),
				"webhook-signature": signWebhook(
					event.id,
					timestamp,
					Buffer.from(value),
					key,
				),
				...headers,
			},
		});
	const options = { registry, secrets: [secret, previous] };
	assert.deepEqual(await verifyWebhookRequest(request(), options), event);
	const throwingRegistry = defineWebhookEvents({
		"fixture.ping": z.unknown().transform(() => {
			throw new Error(body);
		}),
	});
	await assert.rejects(
		verifyWebhookRequest(request(), { ...options, registry: throwingRegistry }),
		(error) =>
			error instanceof Error &&
			error.message === "Webhook verification failed: event",
	);
	assert.deepEqual(
		await verifyWebhookRequest(request(body, previous), options),
		event,
	);
	const multisig = request();
	multisig.headers.set(
		"webhook-signature",
		`v2,ignored v1,${Buffer.alloc(32).toString("base64")} ${multisig.headers.get("webhook-signature")}`,
	);
	assert.deepEqual(await verifyWebhookRequest(multisig, options), event);
	const badTimestamp = request();
	badTimestamp.headers.set("webhook-timestamp", `${now}.invalid`);
	await assert.rejects(verifyWebhookRequest(badTimestamp, options), /headers/);
	const hanging = new Request("https://receiver.example", {
		method: "POST",
		body: new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array([1]));
			},
		}),
		duplex: "half",
	} as RequestInit);
	const keepAlive = setTimeout(() => {}, 1000);
	try {
		await assert.rejects(
			verifyWebhookRequest(hanging, { ...options, readTimeoutMs: 100 }),
			/body-read/,
		);
	} finally {
		clearTimeout(keepAlive);
	}

	for (const readTimeoutMs of [99, 30_001])
		await assert.rejects(verifyWebhookRequest(request(), { ...options, readTimeoutMs }), /configuration/);
	assert.throws(() => verifyWebhookSignature(Buffer.from(body), request().headers, { ...options, toleranceSeconds: 901 }), /configuration/);

	const wrong = request();
	wrong.headers.set(
		"webhook-signature",
		signWebhook(event.id, now, Buffer.from(body), generateWebhookSecret()),
	);
	await assert.rejects(verifyWebhookRequest(wrong, options), /signature/);
	const tampered = request(body + " ");
	tampered.headers.set(
		"webhook-signature",
		signWebhook(event.id, now, Buffer.from(body), secret),
	);
	await assert.rejects(verifyWebhookRequest(tampered, options), /signature/);
	// Exact tolerance boundaries use a fixed clock, independent of earlier async reads.
	for (const offset of [-300, 300])
		assert.equal(
			verifyWebhookSignature(Buffer.from(body), request(body, secret, now + offset).headers, { ...options, now }),
			event.id,
		);
	for (const offset of [-301, 301])
		assert.throws(
			() => verifyWebhookSignature(Buffer.from(body), request(body, secret, now + offset).headers, { ...options, now }),
			/timestamp/,
		);
	// Actual request verification retains generous clock margin across scheduling delays.
	for (const offset of [-600, 600])
		await assert.rejects(
			verifyWebhookRequest(request(body, secret, Math.floor(Date.now() / 1000) + offset), options),
			/timestamp/,
		);
	await assert.rejects(
		verifyWebhookRequest(
			request(body, secret, now, { "content-length": "999999999" }),
			options,
		),
		/body-size/,
	);
	await assert.rejects(
		verifyWebhookRequest(request(), { ...options, maxBodyBytes: 8 }),
		/body-size/,
	);
	await assert.rejects(
		verifyWebhookRequest(request('{"unexpected":"private"}'), options),
		/event/,
	);
	await assert.rejects(
		verifyWebhookRequest(
			request(JSON.stringify({ ...event, type: "unknown.event" })),
			options,
		),
		/event/,
	);
	await assert.rejects(
		verifyWebhookRequest(
			request(JSON.stringify({ ...event, data: { message: 42 } })),
			options,
		),
		/event/,
	);
	await assert.rejects(
		verifyWebhookRequest(
			request(JSON.stringify({ ...event, id: "different" })),
			options,
		),
		/event/,
	);
	// Chunked body enforces actual bytes regardless of Content-Length.
	const streamRequest = new Request("https://receiver.example", {
		method: "POST",
		body: new ReadableStream({
			start(controller) {
				controller.enqueue(Buffer.from(body));
				controller.close();
			},
		}),
		duplex: "half",
	} as RequestInit);
	await assert.rejects(
		verifyWebhookRequest(streamRequest, { ...options, maxBodyBytes: 8 }),
		/body-size/,
	);
	const committed = new Set<string>();
	let enqueued = 0;
	const idempotency = {
		async handoffOnce<T>(
			id: string,
			enqueue: () => Promise<T>,
		): Promise<{ duplicate: true } | { duplicate: false; result: T }> {
			if (committed.has(id)) return { duplicate: true };
			const result = await enqueue();
			committed.add(id);
			return { duplicate: false, result };
		},
	};
	// Test double only, deliberately NOT a durable or concurrency-safe implementation.
	await assert.rejects(
		handoffWebhookRequest(
			request(),
			options,
			async () => {
				throw new Error("enqueue failure");
			},
			idempotency,
		),
		/enqueue failure/,
	);
	assert.equal(
		(
			await handoffWebhookRequest(
				request(),
				options,
				async () => ++enqueued,
				idempotency,
			)
		).duplicate,
		false,
	);
	assert.equal(
		(
			await handoffWebhookRequest(
				request(),
				options,
				async () => ++enqueued,
				idempotency,
			)
		).duplicate,
		true,
	);
	assert.equal(enqueued, 1);
	for (const url of [
		"http://public.example",
		"https://localhost",
		"https://localhost.localdomain",
		"https://ip6-localhost",
		"https://public.example/#",
		"https://foo.localhost",
		"https://127.1",
		"https://10.0.0.1",
		"https://172.16.0.1",
		"https://192.168.1.1",
		"https://169.254.169.254",
		"https://[::1]",
		"https://[::ffff:127.0.0.1]",
		"https://[fe80::1]",
		"https://[fd00::1]",
		"https://user:pass@public.example",
		"https://public.example/#fragment",
	])
		await assert.rejects(
			validateWebhookTarget({ url, signingSecret: secret }),
			/policy/,
		);
	await validateWebhookTarget({
		url: "https://example.com/webhook",
		signingSecret: secret,
	});
	await assert.rejects(
		validateWebhookTarget({
			url: "https://example.com",
			signingSecret: secret,
			policy: {
				validate() {
					throw new Error("private policy details");
				},
			},
		}),
		/policy/,
	);
	assert.throws(
		() =>
			createWebhookEvent(registry, "fixture.ping", { message: "oversized" }, 1),
		/body-size/,
	);
	assert.throws(
		() => defineWebhookEvents({ "invalid-type": z.unknown() }),
		/configuration/,
	);
	console.info(
		"Webhooks unit: published vector, raw verification, rotation, bounds, replay extension and URL policy passed",
	);
}
if (import.meta.main) await webhooksUnit();
