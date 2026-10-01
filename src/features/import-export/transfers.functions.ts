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
		const { TransferError } = await import(
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
			switch (data.action) {
				case "list":
					return {
						ok: true as const,
						kind: "list" as const,
						value: await applicationTransfers.listTransfers(ctx, {
							cursor: data.cursor,
						}),
					};
				case "get":
					return {
						ok: true as const,
						kind: "transfer" as const,
						value: await applicationTransfers.getTransfer(
							ctx,
							data.transferId!,
							true,
						),
					};
				case "start":
					return {
						ok: true as const,
						kind: "transfer" as const,
						value: await applicationTransfers.startImport(ctx, {
							transferId: data.transferId!,
							idempotencyKey: data.idempotencyKey!,
						}),
					};
				case "export":
					return {
						ok: true as const,
						kind: "transfer" as const,
						value: await applicationTransfers.requestExport(ctx, {
							definition: "projects",
							idempotencyKey: data.idempotencyKey!,
						}),
					};
				case "cancel":
					return {
						ok: true as const,
						kind: "transfer" as const,
						value: await applicationTransfers.cancelTransfer(
							ctx,
							data.transferId!,
						),
					};
				case "download":
					return {
						ok: true as const,
						kind: "download" as const,
						value: await applicationTransfers.getExportDownload(
							ctx,
							data.transferId!,
						),
					};
				default:
					throw new TransferError("invalid-input");
			}
		} catch (e) {
			const error =
				e instanceof TransferError ? e : new TransferError("unknown");
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
