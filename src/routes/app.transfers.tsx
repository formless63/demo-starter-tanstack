import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { transferAction } from "../features/import-export/transfers.functions";
export const Route = createFileRoute("/app/transfers")({
	component: TransfersPage,
});
function TransfersPage() {
	const client = useQueryClient();
	const [file, setFile] = useState<File | null>(null);
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const query = useQuery({
		queryKey: ["transfers"],
		queryFn: () => transferAction({ data: { action: "list" } }),
		refetchInterval: 3000,
	});
	const refresh = () => client.invalidateQueries({ queryKey: ["transfers"] });
	async function action(input: Parameters<typeof transferAction>[0]["data"]) {
		setBusy(true);
		try {
			const result = await transferAction({ data: input });
			if (!result.ok) setMessage(result.error.message);
			else if (result.kind === "download")
				window.location.assign(result.value.url);
			else {
				setMessage("Transfer updated");
				await refresh();
			}
		} catch {
			setMessage("Transfer request failed");
		} finally {
			setBusy(false);
		}
	}
	async function upload() {
		if (!file) return;
		setBusy(true);
		try {
			const response = await fetch("/api/transfers-stage", {
				method: "POST",
				body: file,
				headers: { "Content-Type": "text/csv" },
			});
			const result = await response.json();
			if (!response.ok) setMessage(result.error?.message || "Upload failed");
			else {
				setMessage("CSV staged. Select Start import to apply it.");
				await refresh();
			}
		} catch {
			setMessage("Upload failed");
		} finally {
			setBusy(false);
		}
	}
	return (
		<section className="space-y-6">
			<h1 className="text-3xl font-semibold">Import / Export Projects</h1>
			<p>
				CSV columns must be exactly name,description. Import creates new
				personal Projects; reimport creates another copy. Spreadsheet-sensitive
				strings gain an apostrophe on export.
			</p>
			<div className="flex flex-wrap items-end gap-3">
				<label className="space-y-2">
					Project CSV
					<input
						aria-label="Project CSV"
						type="file"
						accept=".csv,text/csv"
						className="block"
						onChange={(e) => setFile(e.target.files?.[0] ?? null)}
					/>
				</label>
				<button
					type="button"
					className="rounded-lg border px-4 py-2"
					disabled={!file || busy}
					onClick={upload}
				>
					Upload CSV
				</button>
				<button
					type="button"
					className="rounded-lg border px-4 py-2"
					disabled={busy}
					onClick={() =>
						action({ action: "export", idempotencyKey: crypto.randomUUID() })
					}
				>
					Export Projects
				</button>
			</div>
			<output aria-live="polite">{message}</output>
			{query.data && !query.data.ok && (
				<p role="alert">{query.data.error.message}</p>
			)}
			{query.data?.ok && query.data.kind === "list" && (
				<ul className="space-y-4">
					{query.data.value.transfers.map((row) => (
						<li key={row.id} className="rounded-lg border p-4 space-y-2">
							<p>
								{row.direction} · {row.status} · {row.createdAt}
							</p>
							<p>
								{row.rowCount ?? "—"} rows · {row.byteCount ?? "—"} bytes
							</p>
							{row.errorCode && <p role="alert">{row.errorCode}</p>}
							{row.issues.map((issue) => (
								<p key={`${issue.row}-${issue.field}-${issue.code}`}>
									Row {issue.row}, {issue.field ?? "row"}: {issue.code}
								</p>
							))}
							{row.errorsTruncated && (
								<p>Additional validation errors omitted.</p>
							)}
							<div className="flex gap-3">
								{row.status === "staged" && (
									<button
										type="button"
										disabled={busy}
										onClick={() =>
											action({
												action: "start",
												transferId: row.id,
												idempotencyKey: row.id,
											})
										}
									>
										Start import
									</button>
								)}
								{["uploading", "staged", "pending"].includes(row.status) && (
									<button
										type="button"
										disabled={busy}
										onClick={() =>
											action({ action: "cancel", transferId: row.id })
										}
									>
										Cancel transfer
									</button>
								)}
								{row.status === "pending" && (
									<button
										type="button"
										disabled={busy}
										onClick={() =>
											action({ action: "get", transferId: row.id })
										}
									>
										Refresh status
									</button>
								)}
								{row.direction === "export" && row.status === "succeeded" && (
									<button
										type="button"
										disabled={busy}
										onClick={() =>
											action({ action: "download", transferId: row.id })
										}
									>
										Download CSV
									</button>
								)}
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
