import { randomUUID } from "node:crypto";
import { readBoundedBody, signWebhook } from "../webhooks/protocol.server";
import {
	type BridgeEvent,
	bridgeEvent,
	connectionId,
	MedusaError,
	parse,
	safeError,
} from "./contract";
import { deadline, validateEndpoint } from "./transport.server";
export const BRIDGE_PROTOCOL = "application-bridge.standard-webhooks-v1";
/** Provider-project producer. Call with a retained ID to reuse it for an in-process delivery retry. */
export async function deliverBridge(
	event: Omit<BridgeEvent, "id" | "version"> & { id?: string },
	configuration: {
		targetUrl: string;
		connectionId: string;
		secret: string;
		signal?: AbortSignal;
		development?: boolean;
		fetch?: typeof fetch;
	},
) {
	parse(connectionId, configuration.connectionId);
	const u = new URL(configuration.targetUrl);
	const origin = validateEndpoint(u.origin, configuration.development);
	if (
		u.username ||
		u.password ||
		u.hash ||
		u.search ||
		u.pathname !==
			`/api/integrations/medusa/webhooks/${configuration.connectionId}` ||
		!configuration.secret.startsWith("whsec_")
	)
		throw new MedusaError("unconfigured");
	const data = parse(bridgeEvent, {
		...event,
		id: event.id ?? randomUUID(),
		version: 1,
	});
	const bytes = Buffer.from(JSON.stringify(data));
	if (bytes.length > 256 * 1024) throw new MedusaError("limit_exceeded");
	const d = deadline(configuration.signal);
	const timestamp = Math.floor(Date.now() / 1000);
	const signature = signWebhook(
		data.id,
		timestamp,
		bytes,
		configuration.secret,
	);
	try {
		const r = await (configuration.fetch ?? fetch)(origin + u.pathname, {
			method: "POST",
			redirect: "error",
			signal: d.signal,
			headers: {
				"content-type": "application/json",
				"webhook-id": data.id,
				"webhook-timestamp": String(timestamp),
				"webhook-signature": signature,
			},
			body: bytes,
		});
		await readBoundedBody(r.body, 2 * 1024 * 1024, d.signal);
		d.signal.throwIfAborted();
		if (!r.ok) throw new MedusaError("unavailable");
		return { id: data.id };
	} catch (e) {
		if (d.signal.aborted)
			throw new MedusaError(
				d.timeout.aborted ? "deadline_exceeded" : "cancelled",
			);
		throw safeError(e);
	}
}
