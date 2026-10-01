import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Transaction } from "./registry.server";
import { isPostgresTimeout, TransferError } from "./validation";
/** Owns a single disposable connection and transaction. Abort closes supported pg Client I/O;
 * no shared pool is destroyed, no caller transaction is committed/reconnected/retried. */
export function createTransferTransactions(
	connectionString: () => string,
	schema: typeof import("../../db/schema"),
) {
	return async <T>(
		work: (tx: Transaction) => Promise<T>,
		deadline: number,
		snapshot = false,
		signal?: AbortSignal,
	): Promise<T> => {
		const remaining = deadline - Date.now();
		if (remaining <= 0) throw new TransferError("timeout");
		let url: string;
		try {
			url = connectionString();
			const parsed = new URL(url);
			if (!["postgres:", "postgresql:"].includes(parsed.protocol))
				throw new Error();
		} catch {
			throw new TransferError("configuration");
		}
		const client = new pg.Client({
			connectionString: url,
			connectionTimeoutMillis: Math.max(1, Math.min(5000, remaining)),
		});
		let timedOut = false;
		let interrupted = false;
		let databaseTimedOut = false;
		let workFailure: unknown;
		// Observe the owned driver's rejected query before application adapters can erase its closed code.
		const query = client.query.bind(client);
		client.query = ((...args: Parameters<typeof client.query>) => {
			const result = Reflect.apply(query, client, args) as unknown;
			if (result && typeof (result as Promise<unknown>).catch === "function")
				return (result as Promise<unknown>).catch((error) => {
					if (isPostgresTimeout(error)) databaseTimedOut = true;
					throw error;
				});
			return result;
		}) as typeof client.query;
		client.on("error", (error) => {
			if (isPostgresTimeout(error)) databaseTimedOut = true;
		});
		const abort = () => {
			timedOut = true;
			void client.end().catch(() => {});
		};
		const cancel = () => {
			interrupted = true;
			void client.end().catch(() => {});
		};
		signal?.addEventListener("abort", cancel, { once: true });
		const timer = setTimeout(abort, remaining);
		try {
			if (signal?.aborted) {
				interrupted = true;
				throw new TransferError("unavailable");
			}
			try {
				await client.connect();
			} catch (error) {
				if (timedOut || interrupted) throw error;
				throw new TransferError("unavailable");
			}
			if (timedOut) throw new TransferError("timeout");
			const database = drizzle(client, { schema });
			const transactionDeadline = Math.min(deadline, Date.now() + 30000);
			const result = await database.transaction(
				async (tx) => {
					try {
						const ms = transactionDeadline - Date.now();
						if (ms <= 1) throw new TransferError("timeout");
						const statementMs = ms - Math.min(1000, Math.ceil(ms / 10));
						await tx.execute(
							sql`select set_config('transaction_timeout',${`${ms}ms`},true),set_config('statement_timeout',${`${statementMs}ms`},true),set_config('lock_timeout',${`${Math.min(ms, 5000)}ms`},true)`,
						);
						return await work(tx);
					} catch (error) {
						workFailure = isPostgresTimeout(error)
							? new TransferError("timeout")
							: error;
						throw workFailure;
					}
				},
				snapshot
					? { isolationLevel: "repeatable read", accessMode: "read only" }
					: undefined,
			);
			if (databaseTimedOut) throw new TransferError("timeout");
			return result;
		} catch (error) {
			if (timedOut) throw new TransferError("timeout");
			if (interrupted)
				throw signal?.reason instanceof TransferError
					? signal.reason
					: new TransferError("unavailable");
			if (
				databaseTimedOut ||
				isPostgresTimeout(workFailure) ||
				isPostgresTimeout(error) ||
				(workFailure instanceof TransferError && workFailure.code === "timeout")
			)
				throw new TransferError("timeout");
			throw workFailure ?? error;
		} finally {
			clearTimeout(timer);
			signal?.removeEventListener("abort", cancel);
			await client.end().catch(() => {});
		}
	};
}
