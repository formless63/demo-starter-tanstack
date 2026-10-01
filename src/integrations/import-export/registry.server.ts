import type { z } from "zod";
import type { db } from "../../db";
import { validateColumns, type ExportCell } from "./csv.server";
import {
	opaqueId,
	requireInput,
	TransferError,
	type TransferContext,
} from "./validation";
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface Definition<T = unknown> {
	name: string;
	version: string;
	columns: readonly string[];
	rowSchema: z.ZodType<T>;
	authorize(
		tx: Transaction,
		context: TransferContext,
		signal: AbortSignal,
	): Promise<boolean>;
	importRows(
		tx: Transaction,
		rows: readonly T[],
		context: TransferContext,
		signal: AbortSignal,
	): Promise<void>;
	// Yield in stable application-key order; reader runs within one read-only snapshot transaction.
	exportRows(
		tx: Transaction,
		context: TransferContext,
		signal: AbortSignal,
	): AsyncIterable<readonly ExportCell[]>;
}
export function createTransferRegistry(definitions: readonly Definition[]) {
	requireInput(definitions.length <= 64);
	const entries = new Map<string, Definition>();
	for (const definition of definitions) {
		requireInput(
			/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(definition.name) &&
				definition.name.length <= 64 &&
				!entries.has(definition.name),
		);
		opaqueId(definition.version);
		requireInput(definition.version.length <= 64);
		validateColumns(definition.columns);
		entries.set(definition.name, definition);
	}
	return {
		get(name: string) {
			const definition = entries.get(name);
			if (!definition) throw new TransferError("invalid-input");
			return definition;
		},
	};
}
