import { createHash, randomUUID } from "node:crypto";
import { type SQL, sql } from "drizzle-orm";
import {
	bindingRef,
	checkSignal,
	connectionId,
	type ErrorCode,
	encodeCursor,
	listInput,
	localCursor,
	MedusaError,
	opaqueId,
	operationRef,
	pageCursor,
	parse,
	type ResourceKind,
	reconcileInput,
	safeError,
	scopeSchema,
	syncInput,
	type TrustedContext,
	uuid,
	withSignal,
} from "./contract";
import {
	object,
	type Projection,
	projection,
	serializeProjection,
} from "./projection";
import {
	adminGet,
	type Connection,
	deadline,
	environmentConnection,
	validateConnection,
} from "./transport.server";
export interface Executor {
	execute(query: SQL): Promise<{ rows: unknown[] }>;
}
export interface Database extends Executor {
	transaction<T>(callback: (tx: Executor) => Promise<T>): Promise<T>;
}
export type Binding = {
	id: string;
	scope_kind: "user" | "tenant";
	scope_id: string;
	connection_id: string;
	resource_kind: ResourceKind;
	remote_id: string;
	local_resource_id: string;
	retired_at: Date | null;
	revision: number;
};
type Operation = {
	id: string;
	scope_kind: "user" | "tenant";
	scope_id: string;
	actor_user_id: string;
	connection_id: string;
	kind:
		| "reconcile_product"
		| "reconcile_order"
		| "sync_product_page"
		| "sync_order_page";
	binding_id: string | null;
	status: string;
	intent: { kind: ResourceKind; limit?: number; offset?: number };
	created_at: Date;
	updated_at: Date;
	error_code: ErrorCode | null;
	processed: number;
	next_cursor: string | null;
};
type Inbox = {
	id: string;
	connection_id: string;
	binding_id: string | null;
	state: string;
};
export type Policy = {
	resolveConnection?: (id: string, signal: AbortSignal) => Promise<Connection>;
	authorizeScope?: (
		actor: string,
		scope: TrustedContext["scope"],
		signal?: AbortSignal,
	) => Promise<boolean>;
	authorizeBoundResource?: (
		context: TrustedContext,
		binding: Binding,
	) => Promise<boolean>;
	authorizeMedusaResource?: (
		context: TrustedContext,
		binding: Binding,
	) => Promise<boolean>;
	authorizeReconciliation?: (
		binding: Binding,
		signal: AbortSignal,
	) => Promise<boolean>;
};
export type Enqueue = (
	tx: Executor,
	payload: { operationId: string } | { inboxId: string },
) => Promise<void>;
const rows = async <T>(tx: Executor, q: SQL) =>
	(await tx.execute(q)).rows as T[];
const one = async <T>(tx: Executor, q: SQL) => (await rows<T>(tx, q))[0];
function view(o: Operation) {
	return {
		id: o.id,
		kind: o.kind,
		status: o.status,
		bindingId: o.binding_id,
		createdAt: new Date(o.created_at).toISOString(),
		updatedAt: new Date(o.updated_at).toISOString(),
		error: o.error_code ? new MedusaError(o.error_code).safe : null,
	};
}
/** All convenience commands own a short transaction; *InTransaction methods never own or retry caller transactions. */
export function createMedusa(options: {
	db: Database;
	enqueue: Enqueue;
	policy?: Policy;
	fetch?: typeof fetch;
	syncConnectionId?: string;
}) {
	const { db, enqueue } = options;
	const policy = options.policy ?? {};
	async function authorize(ctx: TrustedContext) {
		parse(opaqueId, ctx.actorUserId);
		parse(scopeSchema, ctx.scope);
		checkSignal(ctx.signal);
		if (ctx.scope.kind === "user" && ctx.scope.id !== ctx.actorUserId)
			throw new MedusaError("forbidden");
		if (
			!policy.authorizeScope ||
			!(await policy.authorizeScope(ctx.actorUserId, ctx.scope, ctx.signal))
		)
			throw new MedusaError("forbidden");
	}
	async function binding(
		ctx: TrustedContext,
		id: string,
		kind: ResourceKind,
		tx: Executor = db,
	) {
		await authorize(ctx);
		const b = await one<Binding>(
			tx,
			sql`select * from medusa_binding where id=${id} and scope_kind=${ctx.scope.kind} and scope_id=${ctx.scope.id} and resource_kind=${kind} and retired_at is null`,
		);
		if (!b) throw new MedusaError("not_found");
		if (
			!policy.authorizeBoundResource ||
			!policy.authorizeMedusaResource ||
			!(await policy.authorizeBoundResource(ctx, b)) ||
			!(await policy.authorizeMedusaResource(ctx, b))
		)
			throw new MedusaError("forbidden");
		return b;
	}
	async function connection(id: string, signal: AbortSignal) {
		parse(connectionId, id);
		const c = validateConnection(
			policy.resolveConnection
				? await withSignal(policy.resolveConnection(id, signal), signal)
				: environmentConnection(id),
		);
		if (c.id !== id) throw new MedusaError("unconfigured");
		checkSignal(signal);
		return c;
	}
	async function get(ctx: TrustedContext, kind: ResourceKind, input: unknown) {
		const { bindingId } = parse(bindingRef, input);
		await binding(ctx, bindingId, kind);
		const p = await one<{ value: Projection }>(
			db,
			sql`select p.value from medusa_projection p join medusa_binding b on b.id=p.binding_id where b.id=${bindingId} and b.scope_kind=${ctx.scope.kind} and b.scope_id=${ctx.scope.id} and b.resource_kind=${kind} and b.retired_at is null`,
		);
		if (!p) throw new MedusaError("not_found");
		return serializeProjection(p.value, kind);
	}
	async function list(ctx: TrustedContext, kind: ResourceKind, input: unknown) {
		await authorize(ctx);
		const { limit, cursor } = parse(listInput, input);
		const c = localCursor(cursor);
		const found = await rows<{
			id: string;
			created_at: Date;
			value: Projection;
		}>(
			db,
			sql`select b.id,p.created_at,p.value from medusa_projection p join medusa_binding b on b.id=p.binding_id where b.scope_kind=${ctx.scope.kind} and b.scope_id=${ctx.scope.id} and b.resource_kind=${kind} and b.retired_at is null ${c ? sql`and (p.created_at,p.binding_id)<(${c[1]}::timestamptz,${c[2]}::uuid)` : sql``} order by p.created_at desc,p.binding_id desc limit ${limit + 1}`,
		);
		const items: Projection[] = [];
		for (const p of found.slice(0, limit)) {
			await binding(ctx, p.id, kind);
			items.push(serializeProjection(p.value, kind));
		}
		const last = found[limit - 1];
		return {
			items,
			nextCursor:
				found.length > limit && last
					? encodeCursor([1, new Date(last.created_at).toISOString(), last.id])
					: null,
		};
	}
	async function getOperation(ctx: TrustedContext, input: unknown) {
		await authorize(ctx);
		const { operationId } = parse(operationRef, input);
		const o = await one<Operation>(
			db,
			sql`select * from medusa_operation where id=${operationId} and scope_kind=${ctx.scope.kind} and scope_id=${ctx.scope.id}`,
		);
		if (!o) throw new MedusaError("not_found");
		return view(o);
	}
	async function queue(
		tx: Executor,
		ctx: TrustedContext,
		kind: Operation["kind"],
		connectionId: string,
		bindingId: string | null,
		intent: Operation["intent"],
	) {
		await authorize(ctx);
		const id = randomUUID(),
			now = new Date();
		const digest = createHash("sha256")
			.update(JSON.stringify(intent))
			.digest("hex");
		await tx.execute(
			sql`insert into medusa_operation(id,scope_kind,scope_id,actor_user_id,connection_id,kind,binding_id,caller_key,digest,intent,status,created_at,updated_at) values(${id},${ctx.scope.kind},${ctx.scope.id},${ctx.actorUserId},${connectionId},${kind},${bindingId},${id},${digest},${JSON.stringify(intent)}::jsonb,'queued',${now},${now})`,
		);
		await enqueue(tx, { operationId: id });
		return { operationId: id, status: "queued" as const };
	}
	async function requestResourceReconciliationInTransaction(
		tx: Executor,
		ctx: TrustedContext,
		input: unknown,
	) {
		const v = parse(reconcileInput, input);
		const b = await binding(ctx, v.bindingId, v.kind, tx);
		await connection(b.connection_id, deadline(ctx.signal).signal);
		return queue(tx, ctx, `reconcile_${v.kind}`, b.connection_id, b.id, {
			kind: v.kind,
		});
	}
	async function requestSyncPageInTransaction(
		tx: Executor,
		ctx: TrustedContext,
		input: unknown,
	) {
		await authorize(ctx);
		const v = parse(syncInput, input);
		const selected = parse(connectionId, options.syncConnectionId ?? "default");
		await connection(selected, deadline(ctx.signal).signal);
		const offset = pageCursor(v.cursor, v.kind, selected);
		return queue(tx, ctx, `sync_${v.kind}_page`, selected, null, {
			kind: v.kind,
			limit: v.limit,
			offset,
		});
	}
	async function processBinding(
		b: Binding,
		signal: AbortSignal,
		authorized: () => Promise<void>,
		complete?: (tx: Executor) => Promise<void>,
	) {
		signal = deadline(signal).signal;
		const token = randomUUID();
		const lease = await one<Binding>(
			db,
			sql`update medusa_binding set lease_token=${token},lease_until=now()+interval '45 seconds',revision=revision+1 where id=${b.id} and retired_at is null and (lease_until is null or lease_until<now()) returning *`,
		);
		if (!lease) throw new MedusaError("unavailable");
		try {
			await withSignal(authorized(), signal);
			checkSignal(signal);
			const c = await connection(b.connection_id, signal);
			const result = await adminGet(c, b.resource_kind, {
				remoteId: b.remote_id,
				signal,
				fetch: options.fetch,
			});
			checkSignal(signal);
			await withSignal(authorized(), signal);
			await db.transaction(async (tx) => {
				await tx.execute(
					sql`select id from medusa_binding where id=${b.id} for update`,
				);
				await withSignal(authorized(), signal);
				checkSignal(signal);
				const current = await one<Binding>(
					tx,
					sql`select * from medusa_binding where id=${b.id} and retired_at is null and lease_token=${token} and revision=${lease.revision} and lease_until>now()`,
				);
				if (!current) throw new MedusaError("conflict");
				let value: Projection;
				if (result === null) {
					const old = await one<{ value: Projection }>(
						tx,
						sql`select value from medusa_projection where binding_id=${b.id}`,
					);
					if (!old) throw new MedusaError("not_found");
					value = {
						...serializeProjection(old.value, b.resource_kind),
						status: "deleted",
						deleted: true,
						syncedAt: new Date().toISOString(),
					};
				} else value = projection(b.resource_kind, b.id, b.remote_id, result);
				await tx.execute(
					sql`insert into medusa_projection(binding_id,value,created_at,synced_at) values(${b.id},${JSON.stringify(value)}::jsonb,now(),now()) on conflict(binding_id) do update set value=excluded.value,synced_at=excluded.synced_at`,
				);
				if (complete) await complete(tx);
				checkSignal(signal);
			});
		} finally {
			await db.execute(
				sql`update medusa_binding set lease_token=null,lease_until=null where id=${b.id} and lease_token=${token}`,
			);
		}
	}
	async function runOperation(id: string, signal: AbortSignal, retryCount = 0) {
		signal = AbortSignal.any([signal, AbortSignal.timeout(45000)]);
		parse(uuid, id);
		const token = randomUUID();
		const o = await one<Operation>(
			db,
			sql`update medusa_operation set status='dispatching',attempt_token=${token},lease_until=now()+interval '45 seconds',first_dispatch_at=coalesce(first_dispatch_at,now()),updated_at=now(),revision=revision+1 where id=${id} and status='queued' returning *`,
		);
		if (!o) return { status: "ignored" as const };
		const ctx: TrustedContext = {
			actorUserId: o.actor_user_id,
			scope: { kind: o.scope_kind, id: o.scope_id },
			signal,
		};
		try {
			await authorize(ctx);
			checkSignal(signal);
			let nextCursor: string | null = null;
			let processed = o.processed;
			if (o.binding_id) {
				const b = await binding(ctx, o.binding_id, o.intent.kind);
				await processBinding(
					b,
					signal,
					async () => {
						await binding(ctx, b.id, b.resource_kind);
					},
					async (tx) => {
						const updated = await one<{ id: string }>(
							tx,
							sql`update medusa_operation set status='succeeded',error_code=null,processed=1,lease_until=null,updated_at=now() where id=${id} and attempt_token=${token} and status='dispatching' and lease_until>now() returning id`,
						);
						if (!updated) throw new MedusaError("conflict");
					},
				);
				return { status: "processed" as const };
			} else {
				const c = await connection(o.connection_id, signal);
				const offset = o.intent.offset ?? 0;
				const limit = o.intent.limit ?? 25;
				const response = object(
					await adminGet(c, o.intent.kind, {
						limit,
						offset,
						signal,
						fetch: options.fetch,
					}),
				);
				const resources =
					response[o.intent.kind === "product" ? "products" : "orders"];
				if (!Array.isArray(resources) || resources.length > limit)
					throw new MedusaError("unsupported");
				for (let n = processed; n < resources.length; n++) {
					checkSignal(signal);
					const remote = parse(opaqueId, object(resources[n]).id);
					const b = await one<Binding>(
						db,
						sql`select * from medusa_binding where scope_kind=${ctx.scope.kind} and scope_id=${ctx.scope.id} and connection_id=${o.connection_id} and resource_kind=${o.intent.kind} and remote_id=${remote} and retired_at is null`,
					);
					if (b) {
						await binding(ctx, b.id, b.resource_kind);
						await processBinding(b, signal, async () => {
							await binding(ctx, b.id, b.resource_kind);
						});
					}
					processed = n + 1;
					await db.execute(
						sql`update medusa_operation set processed=${processed},updated_at=now() where id=${id} and attempt_token=${token} and status='dispatching'`,
					);
				}
				const nextOffset = offset + resources.length;
				if (!Number.isSafeInteger(nextOffset))
					throw new MedusaError("unsupported");
				nextCursor =
					resources.length === limit
						? encodeCursor([1, o.intent.kind, o.connection_id, nextOffset])
						: null;
			}
			await authorize(ctx);
			checkSignal(signal);
			await db.execute(
				sql`update medusa_operation set status='succeeded',error_code=null,processed=${processed},next_cursor=${nextCursor},lease_until=null,updated_at=now() where id=${id} and attempt_token=${token} and status='dispatching' and lease_until>now()`,
			);
			return { status: "processed" as const };
		} catch (error) {
			const e = safeError(error);
			const retry =
				e.safe.retryable &&
				retryCount < 5 &&
				!signal.aborted &&
				o.binding_id !== null;
			await db.execute(
				sql`update medusa_operation set status=${retry ? "queued" : e.code === "cancelled" ? "cancelled" : "failed"},error_code=${e.code},lease_until=null,updated_at=now() where id=${id} and attempt_token=${token} and status='dispatching'`,
			);
			if (retry) throw e;
			return { status: "ignored" as const, error: e.code };
		}
	}
	async function receiptInTransaction(
		tx: Executor,
		connection: string,
		event: {
			id: string;
			type: string;
			resourceKind?: ResourceKind;
			resourceId?: string;
		},
		digest: string,
		signal: AbortSignal,
	) {
		checkSignal(signal);
		const b =
			event.resourceKind && event.resourceId
				? await one<Binding>(
						tx,
						sql`select * from medusa_binding where connection_id=${connection} and resource_kind=${event.resourceKind} and remote_id=${event.resourceId} and retired_at is null`,
					)
				: undefined;
		const id = randomUUID();
		const accepted = await one<{ id: string }>(
			tx,
			sql`insert into medusa_inbox(id,connection_id,event_id,body_sha256,event_type,binding_id,remote_hint,state,received_at,updated_at) values(${id},${connection},${event.id},${digest},${b ? event.type : "unsupported"},${b?.id ?? null},${b?.remote_id ?? null},${b ? "received" : "ignored"},now(),now()) on conflict(connection_id,event_id) do nothing returning id`,
		);
		if (accepted && b) await enqueue(tx, { inboxId: id });
		if (!accepted) {
			const conflict = await one<{
				id: string;
				state: string;
				binding_id: string | null;
			}>(
				tx,
				sql`update medusa_inbox set conflict_digest=${digest},reconcile_again=true,updated_at=now() where connection_id=${connection} and event_id=${event.id} and body_sha256<>${digest} and (conflict_digest is null or conflict_digest<>${digest}) returning id,state,binding_id`,
			);
			if (
				conflict?.binding_id &&
				["processed", "failed"].includes(conflict.state)
			) {
				await tx.execute(
					sql`update medusa_inbox set state='received',reconcile_again=false,attempt_token=null,lease_until=null,revision=revision+1 where id=${conflict.id}`,
				);
				await enqueue(tx, { inboxId: conflict.id });
			}
		}
		checkSignal(signal);
		return { accepted: true as const };
	}
	async function runInbox(id: string, signal: AbortSignal, retryCount = 0) {
		signal = AbortSignal.any([signal, AbortSignal.timeout(45000)]);
		parse(uuid, id);
		const token = randomUUID();
		const inbox = await one<Inbox>(
			db,
			sql`update medusa_inbox set state='processing',attempt_token=${token},lease_until=now()+interval '45 seconds',revision=revision+1,updated_at=now() where id=${id} and state='received' returning *`,
		);
		if (!inbox) return { status: "ignored" as const };
		try {
			const b = inbox.binding_id
				? await one<Binding>(
						db,
						sql`select * from medusa_binding where id=${inbox.binding_id} and connection_id=${inbox.connection_id} and retired_at is null`,
					)
				: undefined;
			if (!b) {
				await db.execute(
					sql`update medusa_inbox set state='ignored',lease_until=null,updated_at=now() where id=${id} and attempt_token=${token}`,
				);
				return { status: "ignored" as const };
			}
			const authorized = async () => {
				checkSignal(signal);
				const current = await one<Binding>(
					db,
					sql`select * from medusa_binding where id=${b.id} and connection_id=${inbox.connection_id} and retired_at is null`,
				);
				if (
					!current ||
					!policy.authorizeReconciliation ||
					!(await policy.authorizeReconciliation(current, signal))
				)
					throw new MedusaError("forbidden");
			};
			await processBinding(b, signal, authorized, async (tx) => {
				const updated = await one<{ id: string; state: string }>(
					tx,
					sql`update medusa_inbox set state=case when reconcile_again then 'received' else 'processed' end,reconcile_again=false,error_code=null,lease_until=null,updated_at=now() where id=${id} and attempt_token=${token} and state='processing' and lease_until>now() returning id,state`,
				);
				if (!updated) throw new MedusaError("conflict");
				if (updated.state === "received") await enqueue(tx, { inboxId: id });
			});
			return { status: "processed" as const };
		} catch (error) {
			const e = safeError(error);
			const retry = e.safe.retryable && retryCount < 5 && !signal.aborted;
			await db.execute(
				sql`update medusa_inbox set state=${retry ? "received" : "failed"},error_code=${e.code},lease_until=null,updated_at=now() where id=${id} and attempt_token=${token} and state='processing'`,
			);
			if (retry) throw e;
			return { status: "ignored" as const, error: e.code };
		}
	}
	/** Explicit server/operator recovery. No startup recovery; bounded rows and transaction-owned handoff. */
	async function recover(limit = 25) {
		if (!Number.isInteger(limit) || limit < 1 || limit > 100)
			throw new MedusaError("invalid_input");
		return db.transaction(async (tx) => {
			const operations = await rows<{ id: string }>(
				tx,
				sql`update medusa_operation set status='queued',attempt_token=null,lease_until=null,revision=revision+1,updated_at=now() where id in(select id from medusa_operation where status='dispatching' and lease_until<now() order by updated_at limit ${limit} for update skip locked) returning id`,
			);
			const receipts = await rows<{ id: string }>(
				tx,
				sql`update medusa_inbox set state='received',attempt_token=null,lease_until=null,revision=revision+1,updated_at=now() where id in(select id from medusa_inbox where state='processing' and lease_until<now() order by updated_at limit ${limit} for update skip locked) returning id`,
			);
			for (const o of operations) await enqueue(tx, { operationId: o.id });
			for (const r of receipts) await enqueue(tx, { inboxId: r.id });
			return { operations: operations.length, receipts: receipts.length };
		});
	}
	async function retryReceiptInTransaction(tx: Executor, id: string) {
		parse(uuid, id);
		const r = await one<{ id: string }>(
			tx,
			sql`update medusa_inbox set state='received',attempt_token=null,lease_until=null,revision=revision+1,updated_at=now() where id=${id} and state='failed' returning id`,
		);
		if (r) await enqueue(tx, { inboxId: r.id });
		return { requeued: !!r };
	}
	async function pageResult(ctx: TrustedContext, input: unknown) {
		await getOperation(ctx, input);
		const { operationId } = parse(operationRef, input);
		const o = await one<Operation>(
			db,
			sql`select * from medusa_operation where id=${operationId} and scope_kind=${ctx.scope.kind} and scope_id=${ctx.scope.id}`,
		);
		if (!o || !o.kind.startsWith("sync_")) throw new MedusaError("unsupported");
		return { processed: o.processed, nextCursor: o.next_cursor };
	}
	async function cancelOperation(ctx: TrustedContext, input: unknown) {
		await getOperation(ctx, input);
		const { operationId } = parse(operationRef, input);
		const cancelled = await one<Operation>(
			db,
			sql`update medusa_operation set status='cancelled',error_code='cancelled',updated_at=now() where id=${operationId} and scope_kind=${ctx.scope.kind} and scope_id=${ctx.scope.id} and status='queued' returning *`,
		);
		if (!cancelled) throw new MedusaError("conflict");
		return view(cancelled);
	}
	return {
		cancelOperation,
		getProduct: (ctx: TrustedContext, i: unknown) => get(ctx, "product", i),
		getOrder: (ctx: TrustedContext, i: unknown) => get(ctx, "order", i),
		listProducts: (ctx: TrustedContext, i: unknown) => list(ctx, "product", i),
		listOrders: (ctx: TrustedContext, i: unknown) => list(ctx, "order", i),
		getOperation,
		pageResult,
		requestResourceReconciliationInTransaction,
		requestSyncPageInTransaction,
		requestResourceReconciliation: (ctx: TrustedContext, i: unknown) =>
			db.transaction((tx) =>
				requestResourceReconciliationInTransaction(tx, ctx, i),
			),
		requestSyncPage: (ctx: TrustedContext, i: unknown) =>
			db.transaction((tx) => requestSyncPageInTransaction(tx, ctx, i)),
		receiptInTransaction,
		runOperation,
		runInbox,
		recover,
		retryReceiptInTransaction,
		connection,
	};
}
