import { createServerFn } from "@tanstack/react-start";
import type { TransferErrorCode } from "../../integrations/import-export/validation";

interface Input {
	action: "list" | "get" | "start" | "export" | "cancel" | "download";
	transferId?: string;
	idempotencyKey?: string;
	cursor?: string;
}
export const transferAction = createServerFn({ method: "POST" })
	.validator((value: Input) => value)
	.handler(async ({ data }) => {
		const { TransferError, transferErrorStatus } = await import(
			"../../integrations/import-export/validation"
		);
		try {
			const { transferRequestContext } = await import("./request.server");
			const { applicationTransfers } = await import(
				"../../lib/import-export.server"
			);
			const ctx = await transferRequestContext();
			if (!data || typeof data !== "object")
				throw new TransferError("invalid-input");
			const { z } = await import("zod");
			const receipt = z.uuid();
			const key = z
				.string()
				.min(1)
				.max(128)
				.regex(/^[\x20-\x7e]+$/);
			const schema = z.discriminatedUnion("action", [
				z.strictObject({
					action: z.literal("list"),
					cursor: z.string().max(2048).optional(),
				}),
				z.strictObject({ action: z.literal("get"), transferId: receipt }),
				z.strictObject({
					action: z.literal("start"),
					transferId: receipt,
					idempotencyKey: key,
				}),
				z.strictObject({ action: z.literal("export"), idempotencyKey: key }),
				z.strictObject({ action: z.literal("cancel"), transferId: receipt }),
				z.strictObject({ action: z.literal("download"), transferId: receipt }),
			]);
			const parsed = schema.safeParse(data);
			if (!parsed.success) throw new TransferError("invalid-input");
			const input = parsed.data;
			switch (input.action) {
				case "list":
					return {
						ok: true as const,
						kind: "list" as const,
						value: await applicationTransfers.listTransfers(ctx, {
							cursor: input.cursor,
						}),
					};
				case "get":
					return {
						ok: true as const,
						kind: "transfer" as const,
						value: await applicationTransfers.getTransfer(
							ctx,
							input.transferId,
							true,
						),
					};
				case "start":
					return {
						ok: true as const,
						kind: "transfer" as const,
						value: await applicationTransfers.startImport(ctx, {
							transferId: input.transferId,
							idempotencyKey: input.idempotencyKey,
						}),
					};
				case "export":
					return {
						ok: true as const,
						kind: "transfer" as const,
						value: await applicationTransfers.requestExport(ctx, {
							definition: "projects",
							idempotencyKey: input.idempotencyKey,
						}),
					};
				case "cancel":
					return {
						ok: true as const,
						kind: "transfer" as const,
						value: await applicationTransfers.cancelTransfer(
							ctx,
							input.transferId,
						),
					};
				case "download":
					return {
						ok: true as const,
						kind: "download" as const,
						value: await applicationTransfers.getExportDownload(
							ctx,
							input.transferId,
						),
					};
				default:
					throw new TransferError("invalid-input");
			}
		} catch (e) {
			const error =
				e instanceof TransferError ? e : new TransferError("unknown");
			const { setResponseStatus } = await import(
				"@tanstack/react-start/server"
			);
			setResponseStatus(transferErrorStatus[error.code]);
			return {
				ok: false as const,
				error: error.toJSON() as {
					code: TransferErrorCode;
					message: string;
					retryable: boolean;
				},
			};
		}
	});
