import { randomUUID } from "node:crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod";
import { defineJob, type JobHandlerContext } from "../jobs/types";
import {
	opaqueId,
	parse,
	replayAllowed,
	StripeCapabilityError,
	type TrustedContext,
	uuid,
} from "./contract";
import { checkoutProjection, paymentProjection } from "./projection";
import {
	type StripeBinding,
	stripeBindings,
	stripeInbox,
	stripeOperations,
	stripeProjections,
} from "./schema";
import {
	createStripeCapability,
	type StripeTransaction,
	type StripeWiring,
} from "./service.server";
import {
	StripeProviderRejection,
	withinSignal,
	withStripe,
} from "./transport.server";

const payload = z.union([
	z.strictObject({ operationId: uuid }),
	z.strictObject({ inboxId: uuid }),
]);
function requireIntent(
	intent: (typeof stripeOperations.$inferSelect)["intent"],
) {
	if (!intent) throw new StripeCapabilityError("conflict");
	return intent;
}
export function createStripeJobs(wiring: StripeWiring) {
	const service = createStripeCapability(wiring);
	const { db } = wiring;
	async function authorizeCallback(
		binding: StripeBinding,
		signal: AbortSignal,
	) {
		signal.throwIfAborted();
		if (
			binding.retiredAt ||
			!wiring.authorizeReconciliation ||
			!(await wiring.authorizeReconciliation(binding, signal))
		)
			throw new StripeCapabilityError("forbidden");
	}
	async function claimBinding(
		tx: StripeTransaction,
		id: string,
		token: string,
	) {
		const now = new Date();
		const [row] = await tx
			.update(stripeBindings)
			.set({
				leaseToken: token,
				leaseUntil: new Date(+now + 45_000),
				revision: sql`${stripeBindings.revision}+1`,
			})
			.where(
				and(
					eq(stripeBindings.id, id),
					isNull(stripeBindings.retiredAt),
					or(
						isNull(stripeBindings.leaseUntil),
						lt(stripeBindings.leaseUntil, now),
					),
				),
			)
			.returning();
		if (!row) throw new StripeCapabilityError("unavailable");
		return row;
	}
	async function finishProjection(
		tx: StripeTransaction,
		binding: StripeBinding,
		token: string,
		state: Stripe.Checkout.Session | Stripe.PaymentIntent,
		context: TrustedContext | null,
		signal: AbortSignal,
	) {
		if (context)
			await service.binding(context, binding.id, binding.resourceKind, tx);
		else await authorizeCallback(binding, signal);
		const [locked] = await tx
			.update(stripeBindings)
			.set({
				leaseToken: null,
				leaseUntil: null,
				revision: sql`${stripeBindings.revision}+1`,
			})
			.where(
				and(
					eq(stripeBindings.id, binding.id),
					eq(stripeBindings.leaseToken, token),
					eq(stripeBindings.revision, binding.revision),
					isNull(stripeBindings.retiredAt),
				),
			)
			.returning();
		if (!locked) throw new StripeCapabilityError("conflict");
		if (
			state.id !== binding.remoteId ||
			state.livemode !==
				((await service.connection(binding.connectionId, signal)).mode ===
					"live")
		)
			throw new StripeCapabilityError("unsupported");
		const now = new Date();
		if (
			binding.resourceKind === "checkout" &&
			state.object === "checkout.session"
		) {
			const projection = checkoutProjection(binding.id, state, now);
			await tx
				.insert(stripeProjections)
				.values({ bindingId: binding.id, checkout: projection, syncedAt: now })
				.onConflictDoUpdate({
					target: stripeProjections.bindingId,
					set: { checkout: projection, syncedAt: now },
				});
			// Only an authoritative GET of a bound Checkout can acquire its PaymentIntent child.
			const paymentId =
				typeof state.payment_intent === "string"
					? state.payment_intent
					: state.payment_intent?.id;
			if (paymentId) {
				parse(opaqueId, paymentId);
				await tx
					.insert(stripeBindings)
					.values({
						id: randomUUID(),
						scopeKind: binding.scopeKind,
						scopeId: binding.scopeId,
						localResourceId: binding.localResourceId,
						connectionId: binding.connectionId,
						resourceKind: "payment",
						remoteId: paymentId,
						createdAt: now,
					})
					.onConflictDoNothing();
			}
		} else if (
			binding.resourceKind === "payment" &&
			state.object === "payment_intent"
		) {
			const projection = paymentProjection(binding.id, state, now);
			await tx
				.insert(stripeProjections)
				.values({ bindingId: binding.id, payment: projection, syncedAt: now })
				.onConflictDoUpdate({
					target: stripeProjections.bindingId,
					set: { payment: projection, syncedAt: now },
				});
		} else throw new StripeCapabilityError("unsupported");
	}
	async function retrieve(binding: StripeBinding, signal: AbortSignal) {
		const config = await service.connection(binding.connectionId, signal);
		return withStripe<Stripe.Checkout.Session | Stripe.PaymentIntent>(
			config,
			signal,
			(sdk) =>
				binding.resourceKind === "checkout"
					? sdk.checkout.sessions.retrieve(binding.remoteId)
					: sdk.paymentIntents.retrieve(binding.remoteId),
		);
	}
	async function processOperation(
		id: string,
		context: JobHandlerContext,
		signal: AbortSignal,
	) {
		const [initial] = await db
			.select()
			.from(stripeOperations)
			.where(eq(stripeOperations.id, id));
		if (
			!initial ||
			["succeeded", "failed", "cancelled", "reconciliation_required"].includes(
				initial.status,
			)
		)
			return { status: "ignored" };
		const trusted: TrustedContext = {
			actorUserId: initial.actorUserId,
			scope: { kind: initial.scopeKind, id: initial.scopeId },
			signal,
		};
		let token: string | undefined;
		let bound: StripeBinding | undefined;
		try {
			await service.binding(
				trusted,
				initial.sourceBindingId,
				initial.kind === "create_checkout"
					? "customer"
					: initial.kind === "reconcile_checkout"
						? "checkout"
						: "payment",
			);
			const config = await service.connection(initial.connectionId, signal);
			if (
				initial.kind === "create_checkout" &&
				(!initial.intent ||
					initial.intent.accountId !== config.accountId ||
					initial.intent.mode !== config.mode ||
					(initial.firstDispatchAt &&
						!initial.checkoutRemoteId &&
						!replayAllowed(initial.firstDispatchAt)))
			) {
				await db
					.update(stripeOperations)
					.set({
						status: "reconciliation_required",
						updatedAt: new Date(),
						errorCode: "conflict",
					})
					.where(
						and(
							eq(stripeOperations.id, id),
							eq(stripeOperations.status, "queued"),
						),
					);
				return { status: "reconciliation_required" };
			}
			token = randomUUID();
			const attemptToken = token;
			const claimed = await db.transaction(async (tx) => {
				bound = await claimBinding(tx, initial.sourceBindingId, attemptToken);
				const now = new Date();
				const [row] = await tx
					.update(stripeOperations)
					.set({
						status: "dispatching",
						attemptToken,
						leaseUntil: new Date(+now + 45_000),
						firstDispatchAt: initial.firstDispatchAt ?? now,
						updatedAt: now,
						revision: sql`${stripeOperations.revision}+1`,
					})
					.where(
						and(
							eq(stripeOperations.id, id),
							eq(stripeOperations.status, "queued"),
							eq(stripeOperations.revision, initial.revision),
						),
					)
					.returning();
				if (!row) throw new StripeCapabilityError("conflict");
				return row;
			});
			if (!bound) throw new StripeCapabilityError("conflict");
			const source = bound;
			const state =
				claimed.kind === "create_checkout"
					? await withStripe(config, signal, (sdk) =>
							claimed.checkoutRemoteId
								? sdk.checkout.sessions.retrieve(claimed.checkoutRemoteId)
								: sdk.checkout.sessions.create(
										requireIntent(claimed.intent).params,
										{ idempotencyKey: `gs-stripe:${id}` },
									),
						)
					: await retrieve(source, signal);
			if (claimed.kind === "create_checkout") {
				if (
					state.object !== "checkout.session" ||
					state.livemode !== (config.mode === "live") ||
					(typeof state.customer === "string"
						? state.customer
						: state.customer?.id) !== source.remoteId
				)
					throw new StripeCapabilityError("unsupported");
				parse(opaqueId, state.id);
				signal.throwIfAborted();
				const [known] = await db
					.update(stripeOperations)
					.set({ checkoutRemoteId: state.id, updatedAt: new Date() })
					.where(
						and(
							eq(stripeOperations.id, id),
							eq(stripeOperations.attemptToken, attemptToken),
							eq(stripeOperations.revision, claimed.revision),
						),
					)
					.returning();
				if (!known) throw new StripeCapabilityError("conflict");
			}

			signal.throwIfAborted();
			await db.transaction(async (tx) => {
				await service.binding(trusted, source.id, source.resourceKind, tx);
				let target = source;
				if (claimed.kind === "create_checkout") {
					if (
						state.object !== "checkout.session" ||
						state.livemode !== (config.mode === "live") ||
						(claimed.intent?.expectedCurrency &&
							state.currency !== claimed.intent.expectedCurrency)
					)
						throw new StripeCapabilityError("unsupported");
					const customer =
						typeof state.customer === "string"
							? state.customer
							: state.customer?.id;
					if (customer !== source.remoteId)
						throw new StripeCapabilityError("unsupported");
					parse(opaqueId, state.id);
					target = await service.createBindingInTransaction(tx, trusted, {
						localResourceId: id,
						connectionId: source.connectionId,
						resourceKind: "checkout",
						remoteId: state.id,
					});
					target = await claimBinding(tx, target.id, attemptToken);
					await tx
						.update(stripeBindings)
						.set({ leaseToken: null, leaseUntil: null })
						.where(
							and(
								eq(stripeBindings.id, source.id),
								eq(stripeBindings.leaseToken, attemptToken),
							),
						);
				}
				await finishProjection(
					tx,
					target,
					attemptToken,
					state,
					trusted,
					signal,
				);
				const [finished] = await tx
					.update(stripeOperations)
					.set({
						status: "succeeded",
						bindingId: target.id,
						updatedAt: new Date(),
						leaseUntil: null,
						attemptToken: null,
						errorCode: null,
					})
					.where(
						and(
							eq(stripeOperations.id, id),
							eq(stripeOperations.attemptToken, attemptToken),
							eq(stripeOperations.revision, claimed.revision),
						),
					)
					.returning();
				if (!finished) throw new StripeCapabilityError("conflict");
				signal.throwIfAborted();
			});
			return { status: "processed" };
		} catch (error) {
			const code =
				error instanceof StripeCapabilityError ? error.code : "unavailable";
			const write = initial.kind === "create_checkout";
			const uncertainWrite =
				write &&
				token &&
				(initial.checkoutRemoteId ||
					!(error instanceof StripeProviderRejection));
			const retry =
				!signal.aborted &&
				(code === "unavailable" || code === "deadline_exceeded") &&
				context.retryCount < (context.retryLimit ?? 5) &&
				(!write ||
					(!!initial.intent &&
						(!initial.firstDispatchAt ||
							initial.checkoutRemoteId ||
							replayAllowed(initial.firstDispatchAt))));
			await db.transaction(async (tx) => {
				if (token) {
					await tx
						.update(stripeBindings)
						.set({ leaseToken: null, leaseUntil: null })
						.where(
							and(
								eq(stripeBindings.id, initial.sourceBindingId),
								eq(stripeBindings.leaseToken, token),
							),
						);
				}
				await tx
					.update(stripeOperations)
					.set({
						status: retry
							? "queued"
							: uncertainWrite
								? "reconciliation_required"
								: code === "cancelled" && !token
									? "cancelled"
									: "failed",
						errorCode: code,
						updatedAt: new Date(),
						attemptToken: null,
						leaseUntil: null,
					})
					.where(
						and(
							eq(stripeOperations.id, id),
							token
								? eq(stripeOperations.attemptToken, token)
								: eq(stripeOperations.status, "queued"),
						),
					);
			});
			if (retry) throw new Error("Stripe retry unavailable.");
			return {
				status: uncertainWrite ? "reconciliation_required" : "ignored",
				errorCode: code,
			};
		}
	}
	async function processInbox(
		id: string,
		context: JobHandlerContext,
		signal: AbortSignal,
	) {
		const [initial] = await db
			.select()
			.from(stripeInbox)
			.where(eq(stripeInbox.id, id));
		if (!initial?.bindingId || ["processed", "ignored"].includes(initial.state))
			return { status: "ignored" };
		const token = randomUUID();
		let binding: StripeBinding | undefined;
		try {
			const [current] = await db
				.select()
				.from(stripeBindings)
				.where(
					and(
						eq(stripeBindings.id, initial.bindingId),
						isNull(stripeBindings.retiredAt),
					),
				);
			if (!current) throw new StripeCapabilityError("not_found");
			await authorizeCallback(current, signal);
			await db.transaction(async (tx) => {
				binding = await claimBinding(tx, current.id, token);
				const now = new Date();
				const [claimed] = await tx
					.update(stripeInbox)
					.set({
						state: "processing",
						attemptToken: token,
						leaseUntil: new Date(+now + 45_000),
						updatedAt: now,
						revision: sql`${stripeInbox.revision}+1`,
					})
					.where(
						and(
							eq(stripeInbox.id, id),
							eq(stripeInbox.revision, initial.revision),
							or(
								eq(stripeInbox.state, "received"),
								eq(stripeInbox.state, "failed"),
							),
						),
					)
					.returning();
				if (!claimed) throw new StripeCapabilityError("conflict");
			});
			if (!binding) throw new StripeCapabilityError("conflict");
			const bound = binding;
			const state = await retrieve(bound, signal);
			signal.throwIfAborted();
			await db.transaction(async (tx) => {
				await authorizeCallback(bound, signal);
				await finishProjection(tx, bound, token, state, null, signal);
				const [finished] = await tx
					.update(stripeInbox)
					.set({
						state: "processed",
						updatedAt: new Date(),
						attemptToken: null,
						leaseUntil: null,
						errorCode: null,
					})
					.where(
						and(eq(stripeInbox.id, id), eq(stripeInbox.attemptToken, token)),
					)
					.returning();
				if (!finished) throw new StripeCapabilityError("conflict");
				signal.throwIfAborted();
			});
			return { status: "processed" };
		} catch (error) {
			const code =
				error instanceof StripeCapabilityError ? error.code : "unavailable";
			const retry =
				(code === "unavailable" || code === "deadline_exceeded") &&
				context.retryCount < (context.retryLimit ?? 5) &&
				!signal.aborted;
			await db.transaction(async (tx) => {
				await tx
					.update(stripeBindings)
					.set({ leaseToken: null, leaseUntil: null })
					.where(
						and(
							eq(
								stripeBindings.id,
								initial.bindingId ?? "00000000-0000-0000-0000-000000000000",
							),
							eq(stripeBindings.leaseToken, token),
						),
					);
				await tx
					.update(stripeInbox)
					.set({
						state: retry ? "received" : "failed",
						updatedAt: new Date(),
						attemptToken: null,
						leaseUntil: null,
						errorCode: code,
					})
					.where(
						and(
							eq(stripeInbox.id, id),
							or(
								eq(stripeInbox.attemptToken, token),
								and(
									isNull(stripeInbox.attemptToken),
									eq(stripeInbox.revision, initial.revision),
									eq(stripeInbox.state, "received"),
								),
							),
						),
					);
			});
			if (retry) throw new Error("Stripe retry unavailable.");
			return { status: "ignored", errorCode: code };
		}
	}
	/** Explicit bounded recovery; never called at startup. Caller owns transaction. */
	async function recoverInTransaction(tx: StripeTransaction, limit = 100) {
		if (!Number.isInteger(limit) || limit < 1 || limit > 100)
			throw new StripeCapabilityError("invalid_input");
		const now = new Date();
		const stale = await tx
			.select()
			.from(stripeOperations)
			.where(
				and(
					eq(stripeOperations.status, "dispatching"),
					lt(stripeOperations.leaseUntil, now),
				),
			)
			.limit(limit)
			.for("update", { skipLocked: true });
		for (const row of stale) {
			await tx
				.update(stripeOperations)
				.set({
					status:
						row.kind === "create_checkout"
							? "reconciliation_required"
							: "queued",
					attemptToken: null,
					leaseUntil: null,
					updatedAt: now,
					revision: sql`${stripeOperations.revision}+1`,
				})
				.where(eq(stripeOperations.id, row.id));
			if (row.kind !== "create_checkout")
				await wiring.enqueue(tx, { operationId: row.id });
		}
		const receipts = await tx
			.select()
			.from(stripeInbox)
			.where(
				and(
					eq(stripeInbox.state, "processing"),
					lt(stripeInbox.leaseUntil, now),
				),
			)
			.limit(limit)
			.for("update", { skipLocked: true });
		for (const row of receipts) {
			await tx
				.update(stripeInbox)
				.set({
					state: "received",
					attemptToken: null,
					leaseUntil: null,
					updatedAt: now,
					revision: sql`${stripeInbox.revision}+1`,
				})
				.where(eq(stripeInbox.id, row.id));
			await wiring.enqueue(tx, { inboxId: row.id });
		}
		return { operations: stale.length, receipts: receipts.length };
	}
	async function repairInboxInTransaction(
		tx: StripeTransaction,
		id: string,
		signal: AbortSignal,
	) {
		parse(uuid, id);
		const [row] = await tx
			.select()
			.from(stripeInbox)
			.where(eq(stripeInbox.id, id))
			.for("update");
		if (!row?.bindingId) throw new StripeCapabilityError("not_found");
		const [binding] = await tx
			.select()
			.from(stripeBindings)
			.where(
				and(
					eq(stripeBindings.id, row.bindingId),
					isNull(stripeBindings.retiredAt),
				),
			);
		if (!binding) throw new StripeCapabilityError("not_found");
		await authorizeCallback(binding, signal);
		if (row.state !== "failed") return { requeued: false };
		await tx
			.update(stripeInbox)
			.set({
				state: "received",
				attemptToken: null,
				leaseUntil: null,
				errorCode: null,
				updatedAt: new Date(),
				revision: sql`${stripeInbox.revision}+1`,
			})
			.where(eq(stripeInbox.id, id));
		await wiring.enqueue(tx, { inboxId: id });
		return { requeued: true };
	}

	const jobs = {
		"stripe.process": defineJob({
			payload,
			queue: {
				deleteAfterSeconds: 86_400,
				expireInSeconds: 45,
				retryDelay: 30,
				retryLimit: 5,
				retryBackoff: true,
				retryDelayMax: 900,
			},
			async handler(input, context) {
				const meta = context ?? {
					id: randomUUID(),
					signal: new AbortController().signal,
					retryCount: 0,
					retryLimit: 5,
				};
				const signal = AbortSignal.any([
					meta.signal,
					AbortSignal.timeout(45_000),
				]);
				return withinSignal(signal, () =>
					"operationId" in input
						? processOperation(input.operationId, meta, signal)
						: processInbox(input.inboxId, meta, signal),
				);
			},
		}),
	};
	return { jobs, recoverInTransaction, repairInboxInTransaction };
}
