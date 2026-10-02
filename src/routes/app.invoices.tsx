import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
export const Route = createFileRoute("/app/invoices")({
	component: InvoiceNinjaPage,
});
type Invoice = {
	bindingId: string;
	remoteId: string;
	number: string | null;
	status: string;
	currency: string | null;
	amount: string | null;
	balance: string | null;
	syncedAt: string;
	deleted: boolean;
};
type Operation = {
	id: string;
	status: string;
	error: { message: string } | null;
};
function InvoiceNinjaPage() {
	const [items, setItems] = useState<Invoice[]>([]);
	const [cursor, setCursor] = useState<string | null>(null);
	const [binding, setBinding] = useState("");
	const [operation, setOperation] = useState<Operation | null>(null);
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const controller = useRef<AbortController | null>(null);
	const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
	const [description, setDescription] = useState("");
	const [quantity, setQuantity] = useState("1");
	const [cost, setCost] = useState("0");
	const [key, setKey] = useState("");
	useEffect(() => () => controller.current?.abort(), []);
	async function call(action: string, input: unknown) {
		if (controller.current && !controller.current.signal.aborted) return null;
		const abort = new AbortController();
		controller.current = abort;
		setBusy(true);
		setMessage("");
		try {
			const response = await fetch(
				`/api/integrations/invoice-ninja/${action}`,
				{
					method: "POST",
					signal: abort.signal,
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(input),
				},
			);
			const value = await response.json();
			if (abort.signal.aborted) return null;
			if (response.status === 401 || response.status === 403) {
				setItems([]);
				setOperation(null);
			}
			if (!response.ok)
				throw new Error(value.error?.message ?? "Integration unavailable.");
			return value;
		} catch (error) {
			if (!abort.signal.aborted)
				setMessage(
					error instanceof Error ? error.message : "Integration unavailable.",
				);
			return null;
		} finally {
			if (controller.current === abort) {
				setBusy(false);
				controller.current = null;
			}
		}
	}
	async function refresh(next?: string) {
		const page = await call("listInvoices", next ? { cursor: next } : {});
		if (page) {
			setItems(next ? [...items, ...page.items] : page.items);
			setCursor(page.nextCursor);
		}
	}
	async function command(action: string, input: unknown) {
		const result = await call(action, input);
		if (result) {
			const id = result.operationId ?? result.id;
			const view = await call("getOperation", { operationId: id });
			if (view) setOperation(view);
		}
	}
	return (
		<section className="space-y-6">
			<h1 className="text-3xl font-semibold">Invoices</h1>
			<p className="text-muted-foreground">
				View synchronized invoices and request a refresh. Invoice Ninja owns
				invoice totals and lifecycle.
			</p>
			<div className="flex gap-3">
				<button type="button" onClick={() => void refresh()} disabled={busy}>
					Refresh local invoices
				</button>
				{busy && (
					<button
						type="button"
						onClick={() => {
							controller.current?.abort();
							setBusy(false);
							setMessage(
								"Request cancelled. A dispatched draft may still have been created.",
							);
						}}
					>
						Cancel request
					</button>
				)}
			</div>
			{message && <p role="alert">{message}</p>}
			<ul className="space-y-3">
				{items.map((invoice) => (
					<li key={invoice.bindingId} className="rounded-lg border p-4">
						<strong>{invoice.number ?? "Invoice"}</strong> · {invoice.status} ·{" "}
						{invoice.amount ?? "Unknown total"} {invoice.currency ?? ""}
						<p>
							Balance: {invoice.balance ?? "Unknown"} · Synced{" "}
							{invoice.syncedAt}
						</p>
						<button
							type="button"
							disabled={busy}
							onClick={() =>
								void command("requestInvoiceReconciliation", {
									invoiceBindingId: invoice.bindingId,
								})
							}
						>
							Reconcile invoice
						</button>
					</li>
				))}
			</ul>
			{cursor && (
				<button
					type="button"
					disabled={busy}
					onClick={() => void refresh(cursor)}
				>
					Load more
				</button>
			)}
			<fieldset className="space-y-3 rounded-lg border p-4">
				<legend>Bound client</legend>
				<label className="block">
					Client binding ID
					<input
						className="ml-3 rounded border p-2"
						value={binding}
						onChange={(e) => setBinding(e.target.value)}
					/>
				</label>
				<button
					type="button"
					disabled={busy || !binding}
					onClick={() =>
						void command("requestClientReconciliation", {
							clientBindingId: binding,
						})
					}
				>
					Reconcile client
				</button>
				<button
					type="button"
					disabled={busy || !binding}
					onClick={async () => {
						const value = await call("getClient", { bindingId: binding });
						if (value) setMessage(`Client synchronized ${value.syncedAt}.`);
					}}
				>
					Read local client
				</button>
			</fieldset>
			<form
				className="space-y-3 rounded-lg border p-4"
				onSubmit={(e) => {
					e.preventDefault();
					void command("requestDraftInvoice", {
						clientBindingId: binding,
						idempotencyKey: key,
						invoiceDate: date,
						numbering: { mode: "provider" },
						lines: [{ description, quantity, unitCost: cost }],
					});
				}}
			>
				<h2 className="font-semibold">Request an unsent draft</h2>
				<p>
					Requires an operator-verified company policy. Reuse the same request
					key to check an identical request; changed input conflicts.
				</p>
				<label className="block">
					Request key
					<input
						className="ml-3 rounded border p-2"
						required
						maxLength={128}
						value={key}
						onChange={(e) => setKey(e.target.value)}
					/>
				</label>
				<label className="block">
					Invoice date
					<input
						type="date"
						className="ml-3 rounded border p-2"
						required
						value={date}
						onChange={(e) => setDate(e.target.value)}
					/>
				</label>
				<label className="block">
					Description
					<textarea
						className="block rounded border p-2"
						required
						maxLength={2000}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</label>
				<label className="block">
					Quantity
					<input
						className="ml-3 rounded border p-2"
						required
						value={quantity}
						onChange={(e) => setQuantity(e.target.value)}
					/>
				</label>
				<label className="block">
					Unit cost
					<input
						className="ml-3 rounded border p-2"
						required
						value={cost}
						onChange={(e) => setCost(e.target.value)}
					/>
				</label>
				<button disabled={busy || !binding} type="submit">
					Request draft
				</button>
			</form>
			{operation && (
				<div className="rounded-lg border p-4">
					<h2>Operation {operation.status}</h2>
					{operation.error && <p>{operation.error.message}</p>}
					<button
						type="button"
						disabled={busy}
						onClick={async () => {
							const value = await call("getOperation", {
								operationId: operation.id,
							});
							if (value) setOperation(value);
						}}
					>
						Refresh operation
					</button>
					<button
						type="button"
						disabled={busy || operation.status !== "queued"}
						onClick={async () => {
							const value = await call("cancelOperation", {
								operationId: operation.id,
							});
							if (value) setOperation(value);
						}}
					>
						Cancel queued operation
					</button>
				</div>
			)}
		</section>
	);
}
