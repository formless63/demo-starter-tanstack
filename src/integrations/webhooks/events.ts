import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
	bounded,
	DEFAULT_BODY_BYTES,
	WebhookVerificationError,
} from "./protocol.server";

const typeSchema = z
	.string()
	.min(1)
	.max(128)
	.regex(/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/);
export const webhookEnvelopeSchema = z.strictObject({
	id: z
		.string()
		.min(1)
		.max(128)
		.regex(/^[A-Za-z0-9_-]+$/),
	type: typeSchema,
	createdAt: z.iso.datetime(),
	data: z.unknown().refine((value) => value !== undefined),
});
export type WebhookRegistry = Record<string, z.ZodType>;
export type WebhookEvent<R extends WebhookRegistry> = {
	[K in keyof R & string]: {
		id: string;
		type: K;
		createdAt: string;
		data: z.output<R[K]>;
	};
}[keyof R & string];
export function defineWebhookEvents<const R extends WebhookRegistry>(
	registry: R,
): R {
	for (const name of Object.keys(registry))
		if (!typeSchema.safeParse(name).success)
			throw new WebhookVerificationError("configuration");
	return registry;
}
export function parseWebhookEvent<R extends WebhookRegistry>(
	value: unknown,
	registry: R,
): WebhookEvent<R> {
	try {
		const result = webhookEnvelopeSchema.safeParse(value);
		if (!result.success || !Object.hasOwn(registry, result.data.type))
			throw new WebhookVerificationError("event");
		const data = registry[result.data.type]?.safeParse(result.data.data);
		if (!data?.success) throw new WebhookVerificationError("event");
		return { ...result.data, data: data.data } as WebhookEvent<R>;
	} catch {
		throw new WebhookVerificationError("event");
	}
}
export function createWebhookEvent<
	R extends WebhookRegistry,
	K extends keyof R & string,
>(
	registry: R,
	type: K,
	data: z.input<R[K]>,
	maxBodyBytes = DEFAULT_BODY_BYTES,
) {
	const event = parseWebhookEvent(
		{ id: randomUUID(), type, createdAt: new Date().toISOString(), data },
		registry,
	);
	let body: string;
	try {
		body = JSON.stringify(event);
	} catch {
		throw new WebhookVerificationError("event");
	}
	if (Buffer.byteLength(body) > bounded(maxBodyBytes, 1, 1024 * 1024))
		throw new WebhookVerificationError("body-size");
	return { event, body };
}
