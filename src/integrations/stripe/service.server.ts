import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type Stripe from "stripe";
import {
	environmentConnection,
	type StripeConnection,
	validateConnection,
} from "./config.server";
import {
	bindingInput,
	checkoutInput,
	connectionId,
	cursorDecode,
	cursorEncode,
	listInput,
	opaqueId,
	operationInput,
	parse,
	reconciliationInput,
	StripeCapabilityError,
	scopeSchema,
	type TrustedContext,
	uuid,
} from "./contract";
import {
	type StripeBinding,
	stripeBindings,
	stripeInbox,
	stripeOperations,
	stripeProjections,
} from "./schema";
import type { VerifiedHint } from "./webhook.server";

type Database = typeof import("../../db").db;
export type StripeTransaction = Parameters<
	Parameters<Database["transaction"]>[0]
>[0];
export interface StripeWiring {
	db: Database;
	enqueue(
		tx: StripeTransaction,
		payload: { operationId: string } | { inboxId: string },
	): Promise<void>;
	resolveConnection?(
		id: string,
		signal?: AbortSignal,
	): Promise<StripeConnection>;
	authorizeScope?(
		actor: string,
		scope: TrustedContext["scope"],
		signal?: AbortSignal,
	): Promise<boolean>;
	authorizeBoundResource?(
		context: TrustedContext,
		binding: StripeBinding,
	): Promise<boolean>;
	authorizeReconciliation?(
		binding: StripeBinding,
		signal: AbortSignal,
	): Promise<boolean>;
	resolveOffer?(
		offerId: string,
		connectionId: string,
		signal?: AbortSignal,
	): Promise<{ priceId: string; currency: string } | null>;
	approvedRedirects?(
		connectionId: string,
		signal?: AbortSignal,
	): Promise<{ successUrl: string; cancelUrl: string } | null>;
}
export function createStripeCapability(wiring: StripeWiring) {
	const { db } = wiring;
	async function authorize(context: TrustedContext) {
		parse(opaqueId, context.actorUserId);
		parse(scopeSchema, context.scope);
		context.signal?.throwIfAborted();
		if (
			context.scope.kind === "user" &&
			context.scope.id !== context.actorUserId
		)
			throw new StripeCapabilityError("forbidden");
		if (
			!wiring.authorizeScope ||
			!(await wiring.authorizeScope(
				context.actorUserId,
				context.scope,
				context.signal,
			))
		)
			throw new StripeCapabilityError("forbidden");
	}
	async function connection(id: string, signal?: AbortSignal) {
		parse(connectionId, id);
		const config = wiring.resolveConnection
			? await wiring.resolveConnection(id, signal)
			: id === "default"
				? environmentConnection()
				: null;
		if (!config || config.id !== id)
			throw new StripeCapabilityError("unconfigured");
		return validateConnection(config);
	}
	function scoped(context: TrustedContext) {
		return and(
			eq(stripeBindings.scopeKind, context.scope.kind),
			eq(stripeBindings.scopeId, context.scope.id),
			isNull(stripeBindings.retiredAt),
		);
	}
	async function binding(
		context: TrustedContext,
		id: string,
		kind?: StripeBinding["resourceKind"],
		executor: Pick<Database, "select"> = db,
	) {
		await authorize(context);
		parse(uuid, id);
		const [row] = await executor
			.select()
			.from(stripeBindings)
			.where(
				and(
					scoped(context),
					eq(stripeBindings.id, id),
					kind ? eq(stripeBindings.resourceKind, kind) : undefined,
				),
			);
		if (!row) throw new StripeCapabilityError("not_found");
		if (
			!wiring.authorizeBoundResource ||
			!(await wiring.authorizeBoundResource(context, row))
		)
			throw new StripeCapabilityError("forbidden");
		return row;
	}
	function operationView(row: typeof stripeOperations.$inferSelect) {
		return {
			id: row.id,
			kind: row.kind,
			status: row.status,
			bindingId: row.bindingId,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
			error: row.errorCode
				? new StripeCapabilityError(row.errorCode).publicError(
						row.status === "reconciliation_required" ? false : undefined,
					)
				: null,
		};
	}
	/** Caller owns this transaction; helper neither retries nor commits it. Server wiring only. */
	async function createBindingInTransaction(
		tx: StripeTransaction,
		context: TrustedContext,
		input: {
			localResourceId: string;
			connectionId: string;
			resourceKind: StripeBinding["resourceKind"];
			remoteId: string;
		},
	) {
		await authorize(context);
		parse(opaqueId, input.localResourceId);
		parse(opaqueId, input.remoteId);
		parse(connectionId, input.connectionId);
		if (!["customer", "checkout", "payment"].includes(input.resourceKind))
			throw new StripeCapabilityError("invalid_input");
		const value = {
			...input,
			id: randomUUID(),
			scopeKind: context.scope.kind,
			scopeId: context.scope.id,
			createdAt: new Date(),
		};
		const candidate: StripeBinding = {
			...value,
			retiredAt: null,
			revision: 0,
			leaseToken: null,
			leaseUntil: null,
		};
		if (
			!wiring.authorizeBoundResource ||
			!(await wiring.authorizeBoundResource(context, candidate))
		)
			throw new StripeCapabilityError("forbidden");
		const [row] = await tx.insert(stripeBindings).values(value).returning();
		return row;
	}
	/** Owns one short transaction, returning only after commit. No provider calls. */
	async function requestCheckout(context: TrustedContext, input: unknown) {
		const parsed = parse(checkoutInput, input);
		const source = await binding(context, parsed.customerBindingId, "customer");
		const config = await connection(source.connectionId, context.signal);
		if (!wiring.resolveOffer || !wiring.approvedRedirects)
			throw new StripeCapabilityError("unconfigured");
		const items = [...parsed.items].sort((a, b) =>
			a.offerId.localeCompare(b.offerId),
		);
		const normalized = { customerBindingId: parsed.customerBindingId, items };
		const digest = createHash("sha256")
			.update(JSON.stringify(normalized))
			.digest("hex");
		// Check existing immutable intent before consulting mutable offer registry.
		const key = and(
			eq(stripeOperations.scopeKind, context.scope.kind),
			eq(stripeOperations.scopeId, context.scope.id),
			eq(stripeOperations.connectionId, source.connectionId),
			eq(stripeOperations.kind, "create_checkout"),
			eq(stripeOperations.callerKey, parsed.idempotencyKey),
		);
		const [existing] = await db.select().from(stripeOperations).where(key);
		if (existing) {
			if (existing.digest !== digest)
				throw new StripeCapabilityError("conflict");
			return operationView(existing);
		}
		const lines: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
		let currency: string | undefined;
		for (const item of items) {
			const offer = await wiring.resolveOffer(
				item.offerId,
				source.connectionId,
				context.signal,
			);
			if (
				!offer ||
				!/^price_[A-Za-z0-9]+$/.test(offer.priceId) ||
				!/^[a-z]{3}$/.test(offer.currency) ||
				(currency && currency !== offer.currency)
			)
				throw new StripeCapabilityError("unsupported");
			currency = offer.currency;
			lines.push({ price: offer.priceId, quantity: item.quantity });
		}
		const redirects = await wiring.approvedRedirects(
			source.connectionId,
			context.signal,
		);
		if (!redirects) throw new StripeCapabilityError("unconfigured");
		for (const target of [redirects.successUrl, redirects.cancelUrl]) {
			try {
				const url = new URL(target);
				if (
					url.protocol !== "https:" ||
					url.username ||
					url.password ||
					url.hash
				)
					throw 0;
			} catch {
				throw new StripeCapabilityError("unconfigured");
			}
		}
		const params: Stripe.Checkout.SessionCreateParams = {
			mode: "payment",
			customer: source.remoteId,
			line_items: lines,
			success_url: redirects.successUrl,
			cancel_url: redirects.cancelUrl,
			automatic_tax: { enabled: false },
			allow_promotion_codes: false,
			billing_address_collection: "auto",
		};
		return db.transaction(async (tx) => {
			await binding(context, source.id, "customer", tx);
			const now = new Date();
			const [row] = await tx
				.insert(stripeOperations)
				.values({
					id: randomUUID(),
					scopeKind: context.scope.kind,
					scopeId: context.scope.id,
					actorUserId: context.actorUserId,
					connectionId: source.connectionId,
					kind: "create_checkout",
					callerKey: parsed.idempotencyKey,
					digest,
					sourceBindingId: source.id,
					status: "queued",
					intent: { accountId: config.accountId, mode: config.mode, params },
					createdAt: now,
					updatedAt: now,
				})
				.onConflictDoNothing()
				.returning();
			if (!row) {
				const [winner] = await tx.select().from(stripeOperations).where(key);
				if (!winner || winner.digest !== digest)
					throw new StripeCapabilityError("conflict");
				return operationView(winner);
			}
			await wiring.enqueue(tx, { operationId: row.id });
			return { operationId: row.id, status: "queued" as const };
		});
	}
	async function requestPaymentReconciliation(
		context: TrustedContext,
		input: unknown,
	) {
		const parsed = parse(reconciliationInput, input);
		const source = await binding(context, parsed.bindingId, parsed.kind);
		await connection(source.connectionId, context.signal);
		return db.transaction(async (tx) => {
			await binding(context, source.id, parsed.kind, tx);
			const id = randomUUID();
			const now = new Date();
			await tx.insert(stripeOperations).values({
				id,
				scopeKind: context.scope.kind,
				scopeId: context.scope.id,
				actorUserId: context.actorUserId,
				connectionId: source.connectionId,
				kind:
					parsed.kind === "checkout"
						? "reconcile_checkout"
						: "reconcile_payment",
				callerKey: id,
				digest: createHash("sha256").update(source.id).digest("hex"),
				sourceBindingId: source.id,
				bindingId: source.id,
				status: "queued",
				createdAt: now,
				updatedAt: now,
			});
			await wiring.enqueue(tx, { operationId: id });
			return { operationId: id, status: "queued" as const };
		});
	}
	async function getOperation(context: TrustedContext, input: unknown) {
		await authorize(context);
		const { operationId } = parse(operationInput, input);
		const [row] = await db
			.select()
			.from(stripeOperations)
			.where(
				and(
					eq(stripeOperations.id, operationId),
					eq(stripeOperations.scopeKind, context.scope.kind),
					eq(stripeOperations.scopeId, context.scope.id),
				),
			);
		if (!row) throw new StripeCapabilityError("not_found");
		return operationView(row);
	}
	async function getCheckout(context: TrustedContext, input: unknown) {
		const { bindingId } = parse(bindingInput, input);
		await binding(context, bindingId, "checkout");
		const [row] = await db
			.select()
			.from(stripeProjections)
			.where(eq(stripeProjections.bindingId, bindingId));
		if (!row?.checkout) throw new StripeCapabilityError("not_found");
		const p = row.checkout;
		return {
			bindingId: p.bindingId,
			remoteId: p.remoteId,
			status: p.status,
			paymentStatus: p.paymentStatus,
			currency: p.currency,
			amountTotal: p.amountTotal,
			checkoutUrl: p.status === "open" ? p.checkoutUrl : null,
			sourceUpdatedAt: p.sourceUpdatedAt,
			syncedAt: p.syncedAt,
		};
	}
	async function listPayments(context: TrustedContext, input: unknown) {
		await authorize(context);
		const { limit, cursor } = parse(listInput, input);
		const after = cursor ? cursorDecode(cursor) : null;
		const rows = await db
			.select({
				binding: stripeBindings,
				projection: stripeProjections.payment,
			})
			.from(stripeBindings)
			.innerJoin(
				stripeProjections,
				eq(stripeBindings.id, stripeProjections.bindingId),
			)
			.where(
				and(
					scoped(context),
					eq(stripeBindings.resourceKind, "payment"),
					after
						? sql`(${stripeBindings.createdAt},${stripeBindings.id}) < (${after.createdAt},${after.id}::uuid)`
						: undefined,
				),
			)
			.orderBy(desc(stripeBindings.createdAt), desc(stripeBindings.id))
			.limit(limit + 1);
		for (const row of rows) await binding(context, row.binding.id, "payment");
		const page = rows.slice(0, limit);
		const last = page.at(-1);
		return {
			items: page.flatMap(({ projection: p }) =>
				p
					? [
							{
								bindingId: p.bindingId,
								remoteId: p.remoteId,
								status: p.status,
								currency: p.currency,
								amount: p.amount,
								amountReceived: p.amountReceived,
								sourceUpdatedAt: p.sourceUpdatedAt,
								syncedAt: p.syncedAt,
							},
						]
					: [],
			),
			nextCursor:
				rows.length > limit && last
					? cursorEncode(last.binding.createdAt, last.binding.id)
					: null,
		};
	}
	/** Raw authentication occurs before entering this caller-owned receipt transaction. */
	async function receiveInTransaction(
		tx: StripeTransaction,
		config: StripeConnection,
		hint: VerifiedHint,
	) {
		const [bound] =
			hint.kind && hint.remoteId
				? await tx
						.select()
						.from(stripeBindings)
						.where(
							and(
								eq(stripeBindings.connectionId, config.id),
								eq(stripeBindings.resourceKind, hint.kind),
								eq(stripeBindings.remoteId, hint.remoteId),
								isNull(stripeBindings.retiredAt),
							),
						)
				: [];
		const now = new Date();
		const [receipt] = await tx
			.insert(stripeInbox)
			.values({
				id: randomUUID(),
				connectionId: config.id,
				accountId: config.accountId,
				mode: config.mode,
				eventId: hint.eventId,
				bodySHA256: hint.bodySHA256,
				eventType: hint.type,
				bindingId: bound?.id ?? null,
				remoteHint: hint.remoteId,
				state: bound ? "received" : "ignored",
				receivedAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing()
			.returning();
		if (receipt && bound) await wiring.enqueue(tx, { inboxId: receipt.id });
		return { accepted: true as const };
	}
	return {
		authorize,
		connection,
		binding,
		operationView,
		createBindingInTransaction,
		requestCheckout,
		requestPaymentReconciliation,
		getOperation,
		getCheckout,
		listPayments,
		receiveInTransaction,
	};
}
