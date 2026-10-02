import { createHash } from "node:crypto";
import { z } from "zod";
import {
	readBoundedBody,
	verifyWebhookSignature,
	WebhookVerificationError,
} from "../webhooks/protocol.server";
import {
	bridgeEvent,
	checkSignal,
	connectionId,
	MedusaError,
	parse,
	publicResponse,
	safeError,
	uuid,
	withSignal,
} from "./contract";
import type { createMedusa, Database } from "./medusa.server";
/** Receiver owns its receipt transaction. Raw body is verified before parsing and never retained. */
export async function receiveBridge(
	request: Request,
	registeredConnection: string,
	service: ReturnType<typeof createMedusa>,
	db: Database,
) {
	const started = Date.now();
	const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
	try {
		parse(connectionId, registeredConnection);
		if (
			request.method !== "POST" ||
			(request.headers.get("content-encoding") ?? "identity") !== "identity"
		)
			throw new MedusaError("invalid_input");
		for (const name of [
			"webhook-id",
			"webhook-timestamp",
			"webhook-signature",
		]) {
			const h = request.headers.get(name);
			if (h && Buffer.byteLength(h) > 8192)
				throw new MedusaError("limit_exceeded");
			if (
				name === "webhook-signature" &&
				h &&
				!/^v1,[A-Za-z0-9+/]{43}=(?: v1,[A-Za-z0-9+/]{43}=)*$/.test(h)
			)
				throw new MedusaError("invalid_input");
			if (!h || (name !== "webhook-signature" && h.includes(",")))
				throw new MedusaError("invalid_input");
		}
		const c = await service.connection(registeredConnection, signal);
		if (
			!c.bridgeSecrets?.length ||
			c.bridgeSecrets.some((s) => !s.startsWith("whsec_"))
		)
			throw new MedusaError("unconfigured");
		const body = await readBoundedBody(request.body, 1024 * 1024, signal);
		const id = verifyWebhookSignature(body, request.headers, {
			secrets: c.bridgeSecrets,
			toleranceSeconds: 300,
		});
		parse(uuid, id);
		let value: unknown;
		try {
			value = JSON.parse(
				new TextDecoder("utf-8", { fatal: true }).decode(body),
			);
		} catch {
			throw new MedusaError("invalid_input");
		}
		const envelope = parse(
			z.strictObject({
				version: z.literal(1),
				id: uuid,
				type: z.string().min(1).max(128),
				resourceKind: z.enum(["product", "order"]),
				resourceId: z.string().min(1).max(128),
			}),
			value,
		);
		if (envelope.id !== id) throw new MedusaError("invalid_input");
		const supported = [
			"product.created",
			"product.updated",
			"product.deleted",
			"order.placed",
		].includes(envelope.type);
		const event = supported
			? parse(bridgeEvent, value)
			: { id, type: "unsupported" };
		const digest = createHash("sha256").update(body).digest("hex");
		const receipt = await withSignal(
			db.transaction(async (tx) => {
				await tx.execute(
					(await import("drizzle-orm"))
						.sql`select set_config('statement_timeout',${String(Math.max(1, 5000 - (Date.now() - started)))},true)`,
				);
				const result = await service.receiptInTransaction(
					tx,
					registeredConnection,
					event,
					digest,
					signal,
				);
				checkSignal(signal);
				return result;
			}),
			signal,
		);
		checkSignal(signal);
		return publicResponse(receipt);
	} catch (error) {
		let e = safeError(error);
		if (error instanceof WebhookVerificationError)
			e = new MedusaError(
				error.category === "body-size"
					? "limit_exceeded"
					: error.category === "configuration"
						? "unconfigured"
						: "invalid_input",
			);
		if (signal.aborted) e = new MedusaError("unavailable");
		return publicResponse(e.safe, e.status);
	}
}
