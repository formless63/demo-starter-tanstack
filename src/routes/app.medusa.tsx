import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type { Projection } from "../integrations/medusa/projection";
export const Route = createFileRoute("/app/medusa")({ component: MedusaPage });
async function read(path: string, signal?: AbortSignal) {
	const r = await fetch(`/api/integrations/medusa/${path}`, {
		signal,
		cache: "no-store",
	});
	const v = await r.json();
	if (!r.ok) throw new Error(v.message ?? "Integration unavailable.");
	return v;
}
function MedusaPage() {
	const [kind, setKind] = useState<"product" | "order">("product");
	const [cursor, setCursor] = useState<string>();
	const [operation, setOperation] = useState<string>();
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const request = useRef<AbortController | null>(null);
	const query = useQuery<{ items: Projection[]; nextCursor: string | null }>({
		queryKey: ["medusa", kind, cursor],
		retry: false,
		queryFn: ({ signal }) =>
			read(`${kind}s${cursor ? `?cursor=${cursor}` : ""}`, signal),
	});
	const status = useQuery<{ status: string }>({
		queryKey: ["medusa-operation", operation],
		retry: false,
		enabled: !!operation,
		queryFn: ({ signal }) => read(`operation?operationId=${operation}`, signal),
		refetchInterval: (q) =>
			q.state.data && ["queued", "dispatching"].includes(q.state.data.status)
				? 1000
				: false,
	});
	async function command(path: string, input: object) {
		const c = new AbortController();
		request.current = c;
		setBusy(true);
		setMessage("");
		try {
			const r = await fetch(`/api/integrations/medusa/${path}`, {
				method: "POST",
				signal: c.signal,
				headers: { "content-type": "application/json" },
				body: JSON.stringify(input),
			});
			const result = await r.json();
			if (!r.ok) throw new Error(result.message);
			setOperation(result.operationId ?? result.id);
			await query.refetch();
		} catch (e) {
			setMessage(
				e instanceof Error && e.name === "AbortError"
					? "Request stopped. Refresh to check whether it was queued."
					: e instanceof Error
						? e.message
						: "Integration unavailable.",
			);
		} finally {
			setBusy(false);
			request.current = null;
		}
	}
	return (
		<section className="space-y-5">
			<h1 className="text-3xl font-semibold">Commerce</h1>
			<p className="text-muted-foreground">
				Bound products and orders synchronized from Medusa. Refresh to see
				completed reconciliation.
			</p>
			<div className="flex gap-3">
				<button
					type="button"
					onClick={() => {
						setKind("product");
						setCursor(undefined);
					}}
				>
					Products
				</button>
				<button
					type="button"
					onClick={() => {
						setKind("order");
						setCursor(undefined);
					}}
				>
					Orders
				</button>
				<button
					type="button"
					disabled={busy}
					onClick={() => void command("sync-page", { kind, limit: 25 })}
				>
					Sync one page
				</button>
				<button
					type="button"
					onClick={() => {
						setMessage("");
						void query.refetch();
					}}
				>
					Refresh
				</button>
				{busy && (
					<button type="button" onClick={() => request.current?.abort()}>
						Stop request
					</button>
				)}
			</div>
			{message && <p role="alert">{message}</p>}
			{operation && (
				<output>
					Operation: {status.data?.status ?? "Loading…"}{" "}
					{status.data?.status === "queued" && (
						<button
							type="button"
							disabled={busy}
							onClick={() =>
								void command("cancel-operation", { operationId: operation })
							}
						>
							Cancel queued operation
						</button>
					)}
				</output>
			)}
			{query.isPending ? (
				<p>Loading…</p>
			) : query.isError ? (
				<p role="alert">{query.error.message}</p>
			) : (
				<>
					<ul className="space-y-3">
						{query.data.items.map((item) => (
							<li key={item.bindingId} className="rounded-lg border p-4">
								<p>
									{"title" in item ? item.title : "Order"} · {item.status}
								</p>
								<p className="text-sm text-muted-foreground">
									Last sync: {item.syncedAt}
								</p>
								<button
									type="button"
									disabled={busy}
									onClick={() =>
										void command("reconcile", {
											kind,
											bindingId: item.bindingId,
										})
									}
								>
									Reconcile
								</button>
							</li>
						))}
					</ul>
					{!query.data.items.length && (
						<p>
							No bound {kind}s yet. An operator can register an approved
							binding.
						</p>
					)}
					{query.data.nextCursor && (
						<button
							type="button"
							onClick={() => setCursor(query.data.nextCursor ?? undefined)}
						>
							Next page
						</button>
					)}
				</>
			)}
		</section>
	);
}
