import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import type { db as appDb } from "../../db";
import type { JobHandlerContext } from "../jobs/types";
import { StorageError } from "../storage/errors.server";
import type { createStorage } from "../storage/storage.server";
import { transferConfig } from "./config.server";
import {
	boundedBody,
	exportCsv,
	parseImport,
	type ExportCell,
} from "./csv.server";
import type { createTransferRegistry, Transaction } from "./registry.server";
import { transfers, type Transfer } from "./schema";
import {
	idempotencyKey,
	requireInput,
	TransferError,
	transferId,
	validContext,
	type TransferContext,
} from "./validation";
export const transferQueue = "import-export.run";
const terminal = (row: Transfer) =>
	["succeeded", "failed", "cancelled"].includes(row.status);
const fingerprint = (value: unknown) =>
	createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function transferSummary(row: Transfer) {
	return {
		id: row.id,
		direction: row.direction,
		definition: row.definition,
		status: row.status,
		createdAt: row.createdAt.toISOString(),
		...(row.startedAt ? { startedAt: row.startedAt.toISOString() } : {}),
		...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}),
		rowCount: row.rowCount,
		byteCount: row.byteCount,

		errorCode: row.errorCode,
		issues: row.issues,
		errorsTruncated: !!row.errorsTruncated,
	};
}
export interface TransferDependencies {
	db: typeof appDb;
	registry: ReturnType<typeof createTransferRegistry>;
	storage(): ReturnType<typeof createStorage>;
	enqueue(tx: Transaction, transferId: string): Promise<string>;
	jobs(): Promise<{
		getJobById(name: string, id: string): Promise<{ state: string } | null>;
		cancel(name: string, id: string): Promise<unknown>;
	}>;
	// Optional application-owned composition; no Notification/Audit imports in capability.
	complete?(tx: Transaction, row: Transfer): Promise<void>;
}
function classify(error: unknown) {
	if (error instanceof TransferError) return error;
	if (error instanceof StorageError)
		return new TransferError(
			error.code === "configuration"
				? "configuration"
				: error.code === "cancelled"
					? "cancelled"
					: "unavailable",
		);
	const code = (error as { code?: string })?.code;
	return new TransferError(
		[
			"40001",
			"40P01",
			"08000",
			"08003",
			"08006",
			"57P01",
			"53300",
			"ECONNREFUSED",
			"ECONNRESET",
		].includes(code ?? "")
			? "unavailable"
			: code === "57014" || code === "55P03"
				? "timeout"
				: "unknown",
	);
}
export function createTransfers(deps: TransferDependencies) {
	const active = new Map<string, Set<AbortController>>();
	async function transaction<T>(
		work: (tx: Transaction) => Promise<T>,
		deadline = Date.now() + 30000,
		snapshot = false,
	) {
		const ms = Math.min(30000, deadline - Date.now());
		if (ms <= 0) throw new TransferError("timeout");
		return deps.db.transaction(
			async (tx) => {
				await tx.execute(
					sql`select set_config('transaction_timeout', ${`${ms}ms`}, true), set_config('statement_timeout', ${`${ms}ms`}, true), set_config('lock_timeout', ${`${Math.min(5000, ms)}ms`}, true)`,
				);
				return work(tx);
			},
			snapshot
				? { isolationLevel: "repeatable read", accessMode: "read only" }
				: undefined,
		);
	}
	const visible = (ctx: TransferContext) =>
		and(
			eq(transfers.requesterId, ctx.requesterId),
			eq(transfers.scopeKind, ctx.scope.kind),
			eq(transfers.scopeId, ctx.scope.id),
		);
	async function load(
		tx: Transaction,
		id: string,
		ctx?: TransferContext,
		lock = false,
	) {
		transferId(id);
		const query = tx
			.select()
			.from(transfers)
			.where(and(eq(transfers.id, id), ctx ? visible(ctx) : undefined));
		const [row] = await (lock ? query.for("update") : query);
		if (!row) throw new TransferError("not-found");
		return row;
	}
	const contextOf = (row: Transfer): TransferContext => ({
		requesterId: row.requesterId,
		scope: { kind: row.scopeKind, id: row.scopeId },
	});
	async function authorize(
		tx: Transaction,
		ctx: TransferContext,
		definition: string,
		version?: string,
		signal = new AbortController().signal,
	) {
		validContext(ctx);
		const def = deps.registry.get(definition);
		if (version && def.version !== version) throw new TransferError("conflict");
		signal.throwIfAborted();
		if (!(await def.authorize(tx, ctx, signal)))
			throw new TransferError("forbidden");
		signal.throwIfAborted();
		return def;
	}
	async function finish(
		tx: Transaction,
		row: Transfer,
		values: Partial<typeof transfers.$inferInsert>,
	) {
		const [updated] = await tx
			.update(transfers)
			.set({ ...values, updatedAt: new Date(), completedAt: new Date() })
			.where(eq(transfers.id, row.id))
			.returning();
		await deps.complete?.(tx, updated);
		return updated;
	}
	async function failure(id: string, error: TransferError) {
		await transaction(async (tx) => {
			const row = await load(tx, id, undefined, true);
			if (row.status === "pending" || row.status === "uploading")
				await finish(tx, row, {
					status: error.code === "cancelled" ? "cancelled" : "failed",
					errorCode: error.code,
					issues: error.issues,
					errorsTruncated: Number(error.errorsTruncated),
				});
		});
	}
	async function stageImport(
		ctx: TransferContext,
		input: { definition: string; body: AsyncIterable<Uint8Array> },
	) {
		validContext(ctx);
		const config = transferConfig();
		const controller = new AbortController();
		const deadline = Date.now() + config.timeoutSeconds * 1000;
		const timer = setTimeout(
			() => controller.abort(),
			config.timeoutSeconds * 1000,
		);
		let id: string | undefined;
		try {
			const row = await transaction(async (tx) => {
				const definition = await authorize(
					tx,
					ctx,
					input.definition,
					undefined,
					controller.signal,
				);
				id = randomUUID();
				const [row] = await tx
					.insert(transfers)
					.values({
						id,
						requesterId: ctx.requesterId,
						scopeKind: ctx.scope.kind,
						scopeId: ctx.scope.id,
						definition: definition.name,
						version: definition.version,
						direction: "import",
						status: "uploading",
						sourceKey: deps.storage().createKey("transfer-sources"),
						createdAt: new Date(),
						updatedAt: new Date(),
					})
					.returning();
				return row;
			}, deadline);
			const source = await boundedBody(
				input.body,
				config.maxBytes,
				controller.signal,
			);
			await deps.storage().putObject(row.sourceKey!, source.bytes, {
				contentLength: source.byteCount,
				contentType: "text/csv",
				signal: controller.signal,
			});
			const head = await deps
				.storage()
				.headObject(row.sourceKey!, { signal: controller.signal });
			if (head.contentLength !== source.byteCount)
				throw new TransferError("invalid-format");
			return await transaction(async (tx) => {
				const current = await load(tx, row.id, ctx, true);
				if (current.status !== "uploading") throw new TransferError("conflict");
				await authorize(
					tx,
					ctx,
					row.definition,
					row.version,
					controller.signal,
				);
				const [staged] = await tx
					.update(transfers)
					.set({
						status: "staged",
						byteCount: source.byteCount,
						sourceLength: source.byteCount,
						sourceHash: source.hash,
						artifactExpiresAt: new Date(
							Date.now() + config.artifactTtlSeconds * 1000,
						),
						updatedAt: new Date(),
					})
					.where(eq(transfers.id, row.id))
					.returning();
				return transferSummary(staged);
			}, deadline);
		} catch (error) {
			const safe = controller.signal.aborted
				? new TransferError("timeout")
				: classify(error);
			if (id) await failure(id, safe);
			throw safe;
		} finally {
			clearTimeout(timer);
			controller.abort();
		}
	}
	async function startImport(
		ctx: TransferContext,
		input: { transferId: string; idempotencyKey: string },
	) {
		validContext(ctx);
		idempotencyKey(input.idempotencyKey);
		await deps.jobs();
		return transaction(async (tx) => {
			const row = await load(tx, input.transferId, ctx, true);
			await authorize(tx, ctx, row.definition, row.version);
			if (row.direction !== "import") throw new TransferError("conflict");
			const fp = fingerprint([
				row.definition,
				row.version,
				row.id,
				row.sourceHash,
				row.sourceLength,
			]);
			const [existing] = await tx
				.select()
				.from(transfers)
				.where(
					and(
						visible(ctx),
						eq(transfers.direction, "import"),
						eq(transfers.idempotencyKey, input.idempotencyKey),
					),
				);
			if (existing) {
				if (existing.fingerprint !== fp) throw new TransferError("conflict");
				return transferSummary(existing);
			}
			if (row.status !== "staged") throw new TransferError("conflict");
			if (
				!row.artifactExpiresAt ||
				row.artifactExpiresAt.getTime() <= Date.now()
			)
				throw new TransferError("expired");
			const jobId = await deps.enqueue(tx, row.id);
			const [updated] = await tx
				.update(transfers)
				.set({
					status: "pending",
					idempotencyKey: input.idempotencyKey,
					fingerprint: fp,
					jobQueue: transferQueue,
					jobId,
					updatedAt: new Date(),
				})
				.where(eq(transfers.id, row.id))
				.returning();
			return transferSummary(updated);
		});
	}
	async function requestExport(
		ctx: TransferContext,
		input: { definition: string; idempotencyKey: string },
	) {
		validContext(ctx);
		idempotencyKey(input.idempotencyKey);
		await deps.jobs();
		return transaction(async (tx) => {
			const def = await authorize(tx, ctx, input.definition);
			const fp = fingerprint([def.name, def.version]);
			// Serialize same-key creation without introducing a second durable lock/queue.
			await tx.execute(
				sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([ctx.requesterId, ctx.scope, "export", input.idempotencyKey])},0))`,
			);
			const [existing] = await tx
				.select()
				.from(transfers)
				.where(
					and(
						visible(ctx),
						eq(transfers.direction, "export"),
						eq(transfers.idempotencyKey, input.idempotencyKey),
					),
				);
			if (existing) {
				if (existing.fingerprint !== fp) throw new TransferError("conflict");
				return transferSummary(existing);
			}
			const id = randomUUID();
			const jobId = await deps.enqueue(tx, id);
			const [row] = await tx
				.insert(transfers)
				.values({
					id,
					requesterId: ctx.requesterId,
					scopeKind: ctx.scope.kind,
					scopeId: ctx.scope.id,
					definition: def.name,
					version: def.version,
					direction: "export",
					status: "pending",
					idempotencyKey: input.idempotencyKey,
					fingerprint: fp,
					jobId,
					jobQueue: transferQueue,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
				.returning();
			return transferSummary(row);
		});
	}
	async function getTransfer(
		ctx: TransferContext,
		id: string,
		refresh = false,
	) {
		validContext(ctx);
		if (refresh) await reconcileTransfer(ctx, id);
		return transaction(async (tx) => {
			const row = await load(tx, id, ctx);
			await authorize(tx, ctx, row.definition, row.version);
			return transferSummary(row);
		});
	}
	async function listTransfers(
		ctx: TransferContext,
		input: { limit?: number; cursor?: string } = {},
	) {
		validContext(ctx);
		const limit = input.limit ?? 25;
		requireInput(Number.isInteger(limit) && limit >= 1 && limit <= 100);
		let after: { date: Date; id: string } | undefined;
		if (input.cursor !== undefined) {
			requireInput(
				typeof input.cursor === "string" &&
					input.cursor.length <= 2048 &&
					/^[A-Za-z0-9_-]+$/.test(input.cursor),
			);
			try {
				const decoded = Buffer.from(input.cursor, "base64url");
				requireInput(decoded.toString("base64url") === input.cursor);
				const tuple = JSON.parse(decoded.toString());
				requireInput(
					Buffer.from(JSON.stringify(tuple)).toString("base64url") ===
						input.cursor,
				);
				requireInput(
					Array.isArray(tuple) && tuple.length === 3 && tuple[0] === 1,
				);
				transferId(tuple[2]);
				const date = new Date(tuple[1]);
				requireInput(date.toISOString() === tuple[1]);
				after = { date, id: tuple[2] };
			} catch {
				throw new TransferError("invalid-input");
			}
		}
		return transaction(async (tx) => {
			const rows = await tx
				.select()
				.from(transfers)
				.where(
					and(
						visible(ctx),
						after
							? or(
									lt(transfers.createdAt, after.date),
									and(
										eq(transfers.createdAt, after.date),
										lt(transfers.id, after.id),
									),
								)
							: undefined,
					),
				)
				.orderBy(desc(transfers.createdAt), desc(transfers.id))
				.limit(limit + 1);
			for (const row of rows)
				await authorize(tx, ctx, row.definition, row.version);
			const page = rows.slice(0, limit);
			const last = page.at(-1);
			return {
				transfers: page.map(transferSummary),
				cursor:
					rows.length > limit && last
						? Buffer.from(
								JSON.stringify([1, last.createdAt.toISOString(), last.id]),
							).toString("base64url")
						: null,
			};
		});
	}
	async function cancelTransfer(ctx: TransferContext, id: string) {
		validContext(ctx);
		const row = await transaction(async (tx) => {
			const row = await load(tx, id, ctx, true);
			await authorize(tx, ctx, row.definition, row.version);
			if (row.status === "cancelled") return row;
			if (row.status === "succeeded" || row.status === "failed")
				throw new TransferError("conflict");
			return finish(tx, row, { status: "cancelled", errorCode: "cancelled" });
		});
		for (const controller of active.get(id) ?? [])
			controller.abort(new TransferError("cancelled"));
		if (row.jobId)
			try {
				await (await deps.jobs()).cancel(row.jobQueue!, row.jobId);
			} catch {
				/* Receipt is the cancellation authority. */
			}
		return transferSummary(row);
	}
	async function getExportDownload(ctx: TransferContext, id: string) {
		validContext(ctx);
		return transaction(async (tx) => {
			const row = await load(tx, id, ctx, true);
			await authorize(tx, ctx, row.definition, row.version);
			if (
				row.direction !== "export" ||
				row.status !== "succeeded" ||
				!row.outputKey
			)
				throw new TransferError("conflict");
			const remaining = Math.floor(
				((row.artifactExpiresAt?.getTime() ?? 0) - Date.now()) / 1000,
			);
			if (remaining < 30) throw new TransferError("expired");
			return deps
				.storage()
				.presignDownload(row.outputKey, { ttl: Math.min(600, remaining) });
		});
	}
	async function reconcileTransfer(ctx: TransferContext, id: string) {
		validContext(ctx);
		return transaction(async (tx) => {
			const row = await load(tx, id, ctx, true);
			await authorize(tx, ctx, row.definition, row.version);
			if (row.status !== "pending") return transferSummary(row);
			if (!row.jobId || row.jobQueue !== transferQueue)
				throw new TransferError("conflict");
			const job = await (await deps.jobs()).getJobById(row.jobQueue, row.jobId);
			if (!job || job.state === "failed" || job.state === "cancelled")
				return transferSummary(
					await finish(tx, row, {
						status: job?.state === "cancelled" ? "cancelled" : "failed",
						errorCode:
							job?.state === "cancelled"
								? "cancelled"
								: !job
									? "execution-lost"
									: "unknown",
					}),
				);
			return transferSummary(row);
		});
	}
	async function reconcileTransfers(
		ctx: TransferContext,
		ids: readonly string[],
	) {
		requireInput(Array.isArray(ids) && ids.length <= 100);
		return Promise.all(ids.map((id) => reconcileTransfer(ctx, id)));
	}
	async function purgeTransferArtifacts(
		ids: readonly string[],
		options: { execute?: boolean } = {},
	) {
		requireInput(Array.isArray(ids) && ids.length <= 100);
		const results = [];
		for (const id of ids)
			results.push(
				await transaction(async (tx) => {
					const row = await load(tx, id, undefined, true);
					if (
						!terminal(row) &&
						!(
							["uploading", "staged"].includes(row.status) &&
							row.updatedAt.getTime() <
								Date.now() - transferConfig().artifactTtlSeconds * 1000
						)
					)
						throw new TransferError("conflict");
					const keys = [
						...new Set([row.sourceKey, row.outputKey, ...row.artifactKeys]),
					].filter((k): k is string => !!k);
					if (options.execute === true)
						for (const key of keys) await deps.storage().deleteObject(key);
					return {
						id,
						objects: keys.length,
						executed: options.execute === true,
					};
				}),
			);
		return results;
	}
	async function run(id: string, attempt?: JobHandlerContext) {
		transferId(id);
		const started = Date.now();
		const config = transferConfig();
		const deadline = started + config.timeoutSeconds * 1000;
		const controller = new AbortController();
		const claimAbort = () => controller.abort();
		attempt?.signal.addEventListener("abort", claimAbort, { once: true });
		if (attempt?.signal.aborted) claimAbort();
		const timer = setTimeout(
			() => controller.abort(new TransferError("timeout")),
			Math.max(0, deadline - Date.now()),
		);
		const controllers = active.get(id) ?? new Set<AbortController>();
		controllers.add(controller);
		active.set(id, controllers);
		const check = () => {
			if (controller.signal.aborted)
				throw controller.signal.reason instanceof TransferError
					? controller.signal.reason
					: new TransferError("unavailable");
			if (Date.now() >= deadline) throw new TransferError("timeout");
		};
		try {
			const row = await transaction(async (tx) => {
				const row = await load(tx, id, undefined, true);
				if (row.status !== "pending") return row;
				await authorize(
					tx,
					contextOf(row),
					row.definition,
					row.version,
					controller.signal,
				);
				await tx
					.update(transfers)
					.set({ startedAt: new Date(), updatedAt: new Date() })
					.where(eq(transfers.id, id));
				return row;
			}, deadline);
			if (row.status !== "pending") return { outcome: row.status };
			check();
			const ctx = contextOf(row);
			const def = deps.registry.get(row.definition);
			if (row.direction === "import") {
				if (
					!row.artifactExpiresAt ||
					row.artifactExpiresAt.getTime() <= Date.now()
				)
					throw new TransferError("expired");
				const { body } = await deps
					.storage()
					.getObject(row.sourceKey!, { signal: controller.signal });
				if (!body) throw new TransferError("unavailable");
				const source = await boundedBody(
					body as AsyncIterable<Uint8Array>,
					config.maxBytes,
					controller.signal,
				);
				check();
				if (
					source.hash !== row.sourceHash ||
					source.byteCount !== row.sourceLength
				)
					throw new TransferError("invalid-format");
				const rows = parseImport(
					source.bytes,
					def.columns,
					def.rowSchema,
					config,
				);
				check();
				await transaction(async (tx) => {
					const current = await load(tx, id, undefined, true);
					if (current.status !== "pending") return;
					check();
					await authorize(
						tx,
						ctx,
						row.definition,
						row.version,
						controller.signal,
					);
					if (row.artifactExpiresAt!.getTime() <= Date.now())
						throw new TransferError("expired");
					await def.importRows(tx, rows, ctx, controller.signal);
					check();
					await finish(tx, current, {
						status: "succeeded",
						rowCount: rows.length,
						byteCount: source.byteCount,
					});
				}, deadline);
			} else {
				const snapshot = await transaction(
					async (tx) => {
						await authorize(
							tx,
							ctx,
							row.definition,
							row.version,
							controller.signal,
						);
						const snapshotAt = new Date();
						const rows: (readonly ExportCell[])[] = [];
						let normalized = 0;
						for await (const cells of def.exportRows(
							tx,
							ctx,
							controller.signal,
						)) {
							check();
							if (rows.length >= config.maxRows)
								throw new TransferError("limit-exceeded");
							normalized += Buffer.byteLength(JSON.stringify(cells));
							if (normalized > config.maxBytes * 2)
								throw new TransferError("limit-exceeded");
							rows.push(cells);
						}
						return {
							bytes: exportCsv(rows, def.columns, config),
							count: rows.length,
							snapshotAt,
						};
					},
					deadline,
					true,
				);
				check();
				const key = deps.storage().createKey("transfer-exports");
				await transaction(async (tx) => {
					const current = await load(tx, id, undefined, true);
					if (current.status !== "pending")
						throw new TransferError("cancelled");
					if (current.artifactKeys.length >= 64)
						throw new TransferError("limit-exceeded");
					await tx
						.update(transfers)
						.set({
							artifactKeys: [...current.artifactKeys, key],
							updatedAt: new Date(),
						})
						.where(eq(transfers.id, id));
				}, deadline);
				await deps.storage().putObject(key, snapshot.bytes, {
					contentLength: snapshot.bytes.length,
					contentType: "text/csv",
					signal: controller.signal,
				});
				check();
				await transaction(async (tx) => {
					const current = await load(tx, id, undefined, true);
					if (current.status !== "pending") return;
					check();
					await authorize(
						tx,
						ctx,
						row.definition,
						row.version,
						controller.signal,
					);
					await finish(tx, current, {
						status: "succeeded",
						outputKey: key,
						artifactExpiresAt: new Date(
							Date.now() + config.artifactTtlSeconds * 1000,
						),
						snapshotAt: snapshot.snapshotAt,
						rowCount: snapshot.count,
						byteCount: snapshot.bytes.length,
					});
				}, deadline);
			}
			return { outcome: "completed" };
		} catch (error) {
			const safe =
				controller.signal.reason instanceof TransferError
					? controller.signal.reason
					: classify(error);
			// Claim/shutdown abort cannot identify a final attempt; native reconciliation remains authoritative.
			if (attempt?.signal.aborted) throw new TransferError("unavailable");
			if (
				!safe.retryable ||
				(attempt?.retryLimit !== undefined &&
					attempt.retryCount >= attempt.retryLimit)
			)
				await failure(id, safe);
			if (safe.retryable) throw safe;
			return { outcome: "failed", code: safe.code };
		} finally {
			clearTimeout(timer);
			attempt?.signal.removeEventListener("abort", claimAbort);
			controllers.delete(controller);
			if (!controllers.size) active.delete(id);
			controller.abort();
		}
	}
	const safe =
		<A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
		async (...args: A): Promise<R> => {
			try {
				return await fn(...args);
			} catch (error) {
				throw classify(error);
			}
		};
	return {
		stageImport: safe(stageImport),
		startImport: safe(startImport),
		requestExport: safe(requestExport),
		getTransfer: safe(getTransfer),
		listTransfers: safe(listTransfers),
		cancelTransfer: safe(cancelTransfer),
		getExportDownload: safe(getExportDownload),
		reconcileTransfer: safe(reconcileTransfer),
		reconcileTransfers: safe(reconcileTransfers),
		purgeTransferArtifacts: safe(purgeTransferArtifacts),
		run,
	};
}
