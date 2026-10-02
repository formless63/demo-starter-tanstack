import { isIP } from "node:net";
import {
	readBoundedBody,
	WebhookVerificationError,
} from "../webhooks/protocol.server";
import {
	connectionId,
	hasControls,
	MedusaError,
	opaqueId,
	parse,
	type ResourceKind,
} from "./contract";
export type Connection = {
	id: string;
	baseUrl: string;
	secretApiKey: string;
	bridgeSecrets?: readonly string[];
	salesChannelId?: string;
};
export function validateEndpoint(input: string, development = false) {
	try {
		// Inspect the original authority, before URL normalizes numeric/hex host aliases.
		const match =
			/^https?:\/\/(\[[^\]]+\]|[^/:?#@]+)(?::[0-9]+)?(?:[/?#]|$)/i.exec(input);
		if (!match) throw 0;
		const host = match[1].replace(/^\[|\]$/g, "");
		const u = new URL(input);
		const loopback =
			(isIP(host) === 4 && host.startsWith("127.")) ||
			(isIP(host) === 6 && host === "::1");
		if (
			u.username ||
			u.password ||
			u.hash ||
			u.search ||
			u.pathname !== "/" ||
			(u.protocol !== "https:" &&
				!(development && u.protocol === "http:" && loopback))
		)
			throw 0;
		return u.origin;
	} catch {
		throw new MedusaError("unconfigured");
	}
}
export function validateConnection(c: Connection) {
	parse(connectionId, c.id);
	const baseUrl = validateEndpoint(
		c.baseUrl,
		process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development",
	);
	if (
		!c.secretApiKey ||
		Buffer.byteLength(c.secretApiKey) > 8192 ||
		hasControls(c.secretApiKey)
	)
		throw new MedusaError("unconfigured");
	if (c.salesChannelId) parse(opaqueId, c.salesChannelId);
	return { ...c, baseUrl };
}
export function environmentConnection(id = "default"): Connection {
	if (
		id !== "default" ||
		!process.env.MEDUSA_BASE_URL ||
		!process.env.MEDUSA_SECRET_API_KEY
	)
		throw new MedusaError("unconfigured");
	return validateConnection({
		id,
		baseUrl: process.env.MEDUSA_BASE_URL,
		secretApiKey: process.env.MEDUSA_SECRET_API_KEY,
		bridgeSecrets: [
			process.env.MEDUSA_BRIDGE_WEBHOOK_SECRET,
			process.env.MEDUSA_BRIDGE_WEBHOOK_SECRET_PREVIOUS,
		].filter((s): s is string => !!s),
	});
}
export function deadline(
	signal: AbortSignal | undefined,
	milliseconds = 15000,
) {
	if (
		!Number.isInteger(milliseconds) ||
		milliseconds < 1 ||
		milliseconds > 15000
	)
		throw new MedusaError("invalid_input");
	const timeout = AbortSignal.timeout(milliseconds);
	return {
		signal: AbortSignal.any([timeout, ...(signal ? [signal] : [])]),
		timeout,
	};
}
/** Preserve JSON numeric lexemes, including totals, without passing through Number. */
export function exactJson(text: string): unknown {
	let out = "",
		i = 0;
	while (i < text.length) {
		if (text[i] === '"') {
			const start = i++;
			while (i < text.length) {
				if (text[i] === "\\") {
					i += 2;
					continue;
				}
				if (text[i++] === '"') break;
			}
			out += text.slice(start, i);
			continue;
		}
		if (text[i] === "-" || /[0-9]/.test(text[i])) {
			const match =
				/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(
					text.slice(i),
				);
			if (!match) throw new MedusaError("unsupported");
			out += JSON.stringify(match[0]);
			i += match[0].length;
			continue;
		}
		out += text[i++];
	}
	try {
		return JSON.parse(out);
	} catch {
		throw new MedusaError("unsupported");
	}
}
const fields = {
	product: "id,title,handle,status,updated_at",
	order:
		"id,status,payment_status,fulfillment_status,currency_code,total,updated_at",
} as const;
export async function adminGet(
	c: Connection,
	kind: ResourceKind,
	options: {
		remoteId?: string;
		limit?: number;
		offset?: number;
		signal?: AbortSignal;
		timeoutMs?: number;
		fetch?: typeof fetch;
	} = {},
) {
	const d = deadline(options.signal, options.timeoutMs);
	try {
		const connection = validateConnection(c);
		d.signal.throwIfAborted();
		const suffix = options.remoteId
			? `/${encodeURIComponent(parse(opaqueId, options.remoteId))}`
			: "";
		const url = new URL(
			`/admin/${kind === "product" ? "products" : "orders"}${suffix}`,
			connection.baseUrl,
		);
		url.searchParams.set("fields", fields[kind]);
		if (!options.remoteId) {
			url.searchParams.set("limit", String(options.limit ?? 25));
			url.searchParams.set("offset", String(options.offset ?? 0));
		}
		if (connection.salesChannelId)
			url.searchParams.set(
				kind === "product" ? "sales_channel_id" : "sales_channel_id",
				connection.salesChannelId,
			);
		const response = await (options.fetch ?? fetch)(url, {
			method: "GET",
			redirect: "error",
			credentials: "omit",
			signal: d.signal,
			headers: {
				authorization: `Basic ${Buffer.from(`${connection.secretApiKey}:`).toString("base64")}`,
				accept: "application/json",
			},
		});
		const bytes = await readBoundedBody(
			response.body,
			2 * 1024 * 1024,
			d.signal,
		);
		d.signal.throwIfAborted();
		if (response.status === 404 && options.remoteId) return null;
		if (!response.ok)
			throw new MedusaError(
				[408, 429, 500, 502, 503, 504].includes(response.status)
					? "unavailable"
					: "unsupported",
			);
		return exactJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch (e) {
		if (d.signal.aborted)
			throw new MedusaError(
				d.timeout.aborted ? "deadline_exceeded" : "cancelled",
			);
		if (e instanceof WebhookVerificationError)
			throw new MedusaError("limit_exceeded");
		if (e instanceof MedusaError) throw e;
		throw new MedusaError("unavailable");
	}
}
