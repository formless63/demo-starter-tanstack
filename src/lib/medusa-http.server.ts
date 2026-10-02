import { db } from "../db";
import { receiveBridge } from "../integrations/medusa/bridge.server";
import {
	bindingRef,
	listInput,
	MedusaError,
	operationRef,
	parse,
	publicResponse,
	reconcileInput,
	safeError,
	syncInput,
	type TrustedContext,
} from "../integrations/medusa/contract";
import {
	readBoundedBody,
	WebhookVerificationError,
} from "../integrations/webhooks/protocol.server";
import { auth } from "./auth";
import { referenceMedusa } from "./medusa.server";
export async function medusaHttp(request: Request, path: string) {
	if (path.startsWith("webhooks/"))
		return receiveBridge(request, path.slice(9), referenceMedusa, db);
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user) throw new MedusaError("unauthenticated");
		const ctx: TrustedContext = {
			actorUserId: session.user.id,
			scope: { kind: "user", id: session.user.id },
			signal: request.signal,
		};
		if (request.method === "GET") {
			const u = new URL(request.url);
			let result: unknown;
			if (path === "products" || path === "orders") {
				for (const key of u.searchParams.keys())
					if (!["cursor", "limit"].includes(key))
						throw new MedusaError("invalid_input");
				const input = parse(listInput, {
					limit: u.searchParams.has("limit")
						? Number(u.searchParams.get("limit"))
						: undefined,
					cursor: u.searchParams.get("cursor") ?? undefined,
				});
				result = await (path === "products"
					? referenceMedusa.listProducts
					: referenceMedusa.listOrders)(ctx, input);
			} else if (path === "product" || path === "order") {
				if ([...u.searchParams.keys()].some((k) => k !== "bindingId"))
					throw new MedusaError("invalid_input");
				const input = parse(bindingRef, {
					bindingId: u.searchParams.get("bindingId"),
				});
				result = await (path === "product"
					? referenceMedusa.getProduct
					: referenceMedusa.getOrder)(ctx, input);
			} else if (path === "operation" || path === "page-result") {
				if ([...u.searchParams.keys()].some((k) => k !== "operationId"))
					throw new MedusaError("invalid_input");
				const input = parse(operationRef, {
					operationId: u.searchParams.get("operationId"),
				});
				result = await (path === "operation"
					? referenceMedusa.getOperation
					: referenceMedusa.pageResult)(ctx, input);
			} else throw new MedusaError("not_found");
			return publicResponse(result);
		}
		if (request.method !== "POST") throw new MedusaError("unsupported");
		const signal = AbortSignal.any([
			request.signal,
			AbortSignal.timeout(15000),
		]);
		ctx.signal = signal;
		const body = await readBoundedBody(request.body, 256 * 1024, signal);
		let value: unknown;
		try {
			value = JSON.parse(
				new TextDecoder("utf-8", { fatal: true }).decode(body),
			);
		} catch {
			throw new MedusaError("invalid_input");
		}
		const result =
			path === "reconcile"
				? await referenceMedusa.requestResourceReconciliation(
						ctx,
						parse(reconcileInput, value),
					)
				: path === "sync-page"
					? await referenceMedusa.requestSyncPage(ctx, parse(syncInput, value))
					: path === "cancel-operation"
						? await referenceMedusa.cancelOperation(
								ctx,
								parse(operationRef, value),
							)
						: (() => {
								throw new MedusaError("not_found");
							})();
		return publicResponse(result);
	} catch (error) {
		const e =
			error instanceof WebhookVerificationError
				? new MedusaError(
						error.category === "body-size" ? "limit_exceeded" : "invalid_input",
					)
				: safeError(error);
		return publicResponse(e.safe, e.status);
	}
}
