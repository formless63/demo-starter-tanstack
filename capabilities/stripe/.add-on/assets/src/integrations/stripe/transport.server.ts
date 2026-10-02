import Stripe from "stripe";
import { type StripeConnection, validateConnection } from "./config.server";
import {
	API_VERSION,
	MAX_REQUEST,
	MAX_RESPONSE,
	StripeCapabilityError,
} from "./contract";

/** Owns its timer/listeners; caller must dispose after the complete SDK operation. */
export function operationDeadline(signal?: AbortSignal, milliseconds = 15_000) {
	const controller = new AbortController();
	const cancel = () => controller.abort(new StripeCapabilityError("cancelled"));
	if (signal?.aborted) cancel();
	else signal?.addEventListener("abort", cancel, { once: true });
	const timer = setTimeout(
		() => controller.abort(new StripeCapabilityError("deadline_exceeded")),
		Math.max(0, Math.min(milliseconds, 15_000)),
	);
	return {
		signal: controller.signal,
		dispose() {
			clearTimeout(timer);
			signal?.removeEventListener("abort", cancel);
		},
	};
}
export async function readBounded(
	response: Response,
	limit: number,
	signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
	signal.throwIfAborted();
	if (!response.body) return new Uint8Array();
	const reader = response.body.getReader();
	let size = 0;
	const parts: Uint8Array[] = [];
	const cancel = () => {
		void reader.cancel().catch(() => {});
	};
	signal.addEventListener("abort", cancel, { once: true });
	try {
		while (true) {
			signal.throwIfAborted();
			const part = await reader.read();
			signal.throwIfAborted();
			if (part.done) break;
			size += part.value.byteLength;
			if (size > limit) {
				await reader.cancel();
				throw new StripeCapabilityError("limit_exceeded");
			}
			parts.push(part.value);
		}
		const result = new Uint8Array(size);
		let offset = 0;
		for (const p of parts) {
			result.set(p, offset);
			offset += p.length;
		}
		return result;
	} finally {
		signal.removeEventListener("abort", cancel);
		reader.releaseLock();
	}
}
/** New client and native FetchHttpClient per operation; no shared cancellation state. */
export async function withStripe<T>(
	connection: StripeConnection,
	signal: AbortSignal | undefined,
	run: (sdk: Stripe) => Promise<T>,
	options: { milliseconds?: number; fetch?: typeof fetch } = {},
): Promise<T> {
	const config = validateConnection(connection);
	const deadline = operationDeadline(signal, options.milliseconds);
	const endpoint = new URL(config.endpoint ?? "https://api.stripe.com");
	let transportFailure: StripeCapabilityError | undefined;
	const boundedFetch: typeof fetch = async (input, init) => {
		try {
			const url = new URL(String(input));
			if (
				url.origin !== endpoint.origin ||
				!/^\/v1\/(checkout\/sessions(?:\/[^/]+)?|payment_intents\/[^/]+)$/.test(
					url.pathname,
				)
			)
				throw new StripeCapabilityError("unsupported");
			const combined = init?.signal
				? AbortSignal.any([init.signal, deadline.signal])
				: deadline.signal;
			combined.throwIfAborted();
			if (
				init?.body !== undefined &&
				init.body !== null &&
				(typeof init.body !== "string" ||
					Buffer.byteLength(init.body) > MAX_REQUEST)
			)
				throw new StripeCapabilityError("limit_exceeded");
			const headers = new Headers(init?.headers);
			if (headers.has("stripe-account") || headers.has("stripe-context"))
				throw new StripeCapabilityError("unsupported");
			const response = await (options.fetch ?? fetch)(input, {
				...init,
				signal: combined,
				redirect: "error",
			});
			const bytes = await readBounded(response, MAX_RESPONSE, combined);
			return new Response(bytes, {
				status: response.status,
				statusText: response.statusText,
				headers: response.headers,
			});
		} catch (error) {
			if (error instanceof StripeCapabilityError) transportFailure = error;
			throw error;
		}
	};
	const sdk = new Stripe(config.secretKey, {
		apiVersion: API_VERSION,
		maxNetworkRetries: 0,
		telemetry: false,
		timeout: 15_000,
		host: endpoint.hostname,
		port: Number(endpoint.port || (endpoint.protocol === "https:" ? 443 : 80)),
		protocol: endpoint.protocol === "https:" ? "https" : "http",
		httpClient: Stripe.createFetchHttpClient(boundedFetch),
	});
	try {
		return await run(sdk);
	} catch (error) {
		if (deadline.signal.aborted) throw deadline.signal.reason;
		if (transportFailure) throw transportFailure;
		if (error instanceof StripeCapabilityError) throw error;
		// SDK errors can carry headers, response bodies and request identifiers. Never expose them.
		throw new StripeCapabilityError("unavailable");
	} finally {
		deadline.dispose();
	}
}
