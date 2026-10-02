import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PaymentProjection } from "../integrations/stripe/schema";
export const Route = createFileRoute("/app/payments")({
	component: PaymentsPage,
});
interface Operation {
	id: string;
	status: string;
	bindingId: string | null;
	error: { message: string } | null;
}
async function call(action: string, input: unknown, signal?: AbortSignal) {
	const response = await fetch(`/api/integrations/stripe/${action}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
		signal,
	});
	const result = await response.json();
	if (!response.ok) throw Error(result.error?.message ?? "Operation failed.");
	return result;
}

function PaymentsPage() {
	const [ready, setReady] = useState(false);
	useEffect(() => setReady(true), []);
	const [bindingId, setBindingId] = useState("");
	const [offerId, setOfferId] = useState("standard");
	const [quantity, setQuantity] = useState(1);
	const [operationId, setOperationId] = useState("");
	const [operation, setOperation] = useState<Operation | null>(null);
	const [payments, setPayments] = useState<PaymentProjection[]>([]);
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const [url, setUrl] = useState<string | null>(null);
	const key = useRef(crypto.randomUUID());
	const intent = useRef<string | null>(null);
	const controller = useRef<AbortController | null>(null);
	const refresh = useCallback(async () => {
		try {
			const result = await call("listPayments", {});
			setPayments(result.items);
			if (operationId) {
				const state = await call("getOperation", { operationId });
				setOperation(state);
				if (state.status === "succeeded" && state.bindingId) {
					try {
						const checkout = await call("getCheckout", {
							bindingId: state.bindingId,
						});
						setUrl(checkout.checkoutUrl);
					} catch {
						setUrl(null);
					}
				}
			}
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Refresh failed.");
		}
	}, [operationId]);
	useEffect(() => {
		let active = true;
		const poll = async () => {
			if (active) await refresh();
		};
		void poll();
		const timer = setInterval(poll, 3000);
		return () => {
			active = false;
			clearInterval(timer);
			controller.current?.abort();
		};
	}, [refresh]);
	async function submit() {
		if (busy) return;
		setBusy(true);
		setMessage("");
		const abort = new AbortController();
		controller.current = abort;
		const normalized = JSON.stringify({
			customerBindingId: bindingId,
			items: [{ offerId, quantity }],
		});
		if (intent.current !== normalized) {
			intent.current = normalized;
			key.current = crypto.randomUUID();
		}
		try {
			const result = await call(
				"requestCheckout",
				{
					customerBindingId: bindingId,
					idempotencyKey: key.current,
					items: [{ offerId, quantity }],
				},
				abort.signal,
			);
			setOperationId(result.operationId ?? result.id);
			setMessage(
				"Checkout operation recorded. Payment status will update after reconciliation.",
			);
		} catch (error) {
			setMessage(
				abort.signal.aborted
					? "Request cancelled. A recorded operation may still continue; check its status before trying again."
					: error instanceof Error
						? error.message
						: "Checkout request failed.",
			);
		} finally {
			setBusy(false);
			controller.current = null;
		}
	}
	async function cancel() {
		try {
			const result = await call("cancelOperation", { operationId });
			setOperation(result);
			setMessage("Queued operation cancelled.");
		} catch (error) {
			setMessage(
				error instanceof Error ? error.message : "Cancellation failed.",
			);
		}
	}
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Payments</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Request a one-time hosted Checkout for an approved offer. Checkout
					completion and payment success are shown separately.
				</p>
			</div>
			<form
				className="grid gap-4 rounded-xl border bg-background p-5"
				onSubmit={(e) => {
					e.preventDefault();
					void submit();
				}}
			>
				<label className="grid gap-1 text-sm">
					Customer binding
					<input
						className="rounded-md border p-2"
						disabled={!ready}
						value={bindingId}
						onChange={(e) => setBindingId(e.target.value)}
						placeholder="Local customer binding UUID"
						required
					/>
				</label>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="grid gap-1 text-sm">
						Approved offer
						<input
							className="rounded-md border p-2"
							disabled={!ready}
							value={offerId}
							onChange={(e) => setOfferId(e.target.value)}
							required
						/>
					</label>
					<label className="grid gap-1 text-sm">
						Quantity
						<input
							className="rounded-md border p-2"
							disabled={!ready}
							type="number"
							min={1}
							max={100}
							value={quantity}
							onChange={(e) => setQuantity(Number(e.target.value))}
							required
						/>
					</label>
				</div>
				<div className="flex gap-3">
					<button
						className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
						type="submit"
						disabled={!ready || busy}
					>
						{busy ? "Recording…" : "Request Checkout"}
					</button>
					{busy && (
						<button
							type="button"
							className="rounded-md border px-4 py-2"
							onClick={() => controller.current?.abort()}
						>
							Cancel request
						</button>
					)}
				</div>
				<p className="text-xs text-muted-foreground">
					Repeated requests with the same selection reuse the recorded intent.
					Your application must supply a customer binding and approved offers.
				</p>
			</form>
			<output aria-live="polite" className="block text-sm">
				{message}
			</output>
			<section className="space-y-3 rounded-xl border bg-background p-5">
				<h2 className="font-semibold">Operation</h2>
				<label className="grid gap-1 text-sm">
					Operation ID
					<input
						className="rounded-md border p-2"
						disabled={!ready}
						value={operationId}
						onChange={(e) => setOperationId(e.target.value)}
						placeholder="Local operation UUID"
					/>
				</label>
				<button
					className="rounded-md border px-3 py-2 text-sm"
					type="button"
					onClick={() => void refresh()}
				>
					Refresh status
				</button>
				{operation && (
					<p className="text-sm">
						{operation.status}
						{operation.error ? `: ${operation.error.message}` : ""}
					</p>
				)}
				{operation?.status === "queued" && (
					<button
						className="ml-3 rounded-md border px-3 py-2 text-sm"
						type="button"
						onClick={() => void cancel()}
					>
						Cancel queued operation
					</button>
				)}
				{url && (
					<a className="block text-sm underline" href={url} rel="noreferrer">
						Continue to hosted Checkout
					</a>
				)}
			</section>
			<section className="space-y-3">
				<h2 className="font-semibold">Local payment status</h2>
				{payments.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No reconciled payments yet.
					</p>
				) : (
					<ul className="space-y-2">
						{payments.map((p) => (
							<li
								className="rounded-lg border bg-background p-4 text-sm"
								key={p.bindingId}
							>
								<strong>{p.status}</strong>
								<span className="ml-3">
									{p.currency?.toUpperCase() ?? "Unknown currency"} ·{" "}
									{p.amountReceived ?? "Unknown"} minor units received
								</span>
								<p className="mt-1 text-muted-foreground">
									Synced {p.syncedAt}
								</p>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
