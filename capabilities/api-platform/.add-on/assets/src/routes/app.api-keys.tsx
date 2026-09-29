import {
	IconCheck,
	IconCopy,
	IconKey,
	IconPlus,
	IconX,
} from "@tabler/icons-react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
	createApiKey,
	getApiKeyManager,
	listApiKeys,
	revokeApiKey,
} from "#/integrations/api-platform/api-keys.functions";
import type { ApiPermissions } from "#/integrations/api-platform/permissions";

export const Route = createFileRoute("/app/api-keys")({
	beforeLoad: async () => {
		if (!(await getApiKeyManager())) throw redirect({ to: "/" });
	},
	component: ApiKeysPage,
});

function ApiKeysPage() {
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const [permissions, setPermissions] = useState<ApiPermissions>({
		projects: ["read"],
	});
	const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
	const [newSecret, setNewSecret] = useState<string | null>(null);
	const [keys, setKeys] = useState<Awaited<ReturnType<typeof listApiKeys>>>([]);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const refresh = useCallback(async () => {
		try {
			setKeys(await listApiKeys());
			setError(null);
		} catch {
			setError("API keys could not be loaded.");
		} finally {
			setLoading(false);
		}
	}, []);
	useEffect(() => {
		void refresh();
	}, [refresh]);

	const create = async () => {
		setSubmitting(true);
		try {
			const result = await createApiKey({
				data: { name, permissions, expiresInDays },
			});
			setNewSecret(result.secret);
			setCreating(false);
			setName("");
			setPermissions({ projects: ["read"] });
			setExpiresInDays(null);
			await refresh();
		} catch {
			setError("Could not create the API key.");
		} finally {
			setSubmitting(false);
		}
	};

	const revoke = async (keyId: string) => {
		setSubmitting(true);
		try {
			await revokeApiKey({ data: { keyId } });
			await refresh();
		} catch {
			setError("Could not revoke the API key.");
		} finally {
			setSubmitting(false);
		}
	};

	const togglePermission = (permission: "read" | "write") => {
		setPermissions((current) => ({
			projects: current.projects.includes(permission)
				? current.projects.filter((value) => value !== permission)
				: [...current.projects, permission],
		}));
	};

	return (
		<section>
			<div className="mb-8 flex items-start justify-between gap-4">
				<div>
					<h1 className="text-3xl font-semibold tracking-tight">API keys</h1>
					<p className="mt-1 text-muted-foreground">
						Create user-owned credentials for the versioned machine API.
					</p>
				</div>
				<button
					type="button"
					className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground"
					onClick={() => setCreating(true)}
				>
					<IconPlus size={18} /> New key
				</button>
			</div>

			{newSecret && (
				<div className="mb-6 rounded-xl border border-primary/30 bg-card p-5">
					<div className="flex items-start justify-between gap-4">
						<div>
							<h2 className="font-semibold">Copy this key now</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								It cannot be recovered after this message is dismissed.
							</p>
						</div>
						<button
							type="button"
							aria-label="Dismiss API key"
							onClick={() => setNewSecret(null)}
						>
							<IconX size={18} />
						</button>
					</div>
					<div className="mt-4 flex gap-2">
						<code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-muted p-3 text-sm">
							{newSecret}
						</code>
						<button
							type="button"
							className="rounded-lg border px-3"
							onClick={async () => {
								await navigator.clipboard.writeText(newSecret);
							}}
						>
							<IconCopy size={18} />
						</button>
					</div>
				</div>
			)}

			{creating && (
				<form
					className="mb-6 space-y-4 rounded-xl border bg-card p-5"
					onSubmit={(event) => {
						event.preventDefault();
						void create();
					}}
				>
					<label className="block text-sm font-medium">
						Name
						<input
							required
							maxLength={32}
							className="mt-1 block w-full rounded-lg border bg-background px-3 py-2"
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</label>
					<fieldset>
						<legend className="text-sm font-medium">Project permissions</legend>
						<div className="mt-2 flex flex-wrap gap-4">
							{(["read", "write"] as const).map((permission) => (
								<label
									className="flex items-center gap-2 text-sm"
									key={permission}
								>
									<input
										type="checkbox"
										checked={permissions.projects.includes(permission)}
										onChange={() => togglePermission(permission)}
									/>
									Projects: {permission}
								</label>
							))}
						</div>
					</fieldset>
					<label className="block text-sm font-medium">
						Expiration
						<select
							className="mt-1 block w-full rounded-lg border bg-background px-3 py-2"
							value={expiresInDays ?? ""}
							onChange={(event) =>
								setExpiresInDays(
									event.target.value ? Number(event.target.value) : null,
								)
							}
						>
							<option value="">No expiration</option>
							<option value="30">30 days</option>
							<option value="90">90 days</option>
							<option value="365">1 year</option>
						</select>
					</label>
					<div className="flex gap-2">
						<button
							type="submit"
							disabled={submitting || permissions.projects.length === 0}
							className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
						>
							Create key
						</button>
						<button
							type="button"
							className="rounded-lg border px-4 py-2"
							onClick={() => setCreating(false)}
						>
							Cancel
						</button>
					</div>
				</form>
			)}

			{error && <p className="mb-4 text-sm text-destructive">{error}</p>}
			{loading ? (
				<p className="rounded-xl border p-8 text-center text-muted-foreground">
					Loading API keys…
				</p>
			) : keys.length === 0 ? (
				<div className="rounded-xl border border-dashed bg-card p-12 text-center">
					<IconKey className="mx-auto text-muted-foreground" />
					<h2 className="mt-4 font-semibold">No API keys</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Create one when a machine needs API access.
					</p>
				</div>
			) : (
				<div className="space-y-3">
					{keys.map((key) => (
						<article className="rounded-xl border bg-card p-5" key={key.id}>
							<div className="flex flex-wrap items-start justify-between gap-4">
								<div>
									<div className="flex items-center gap-2">
										<h2 className="font-semibold">{key.name}</h2>
										<span className="flex items-center gap-1 text-xs text-muted-foreground">
											{key.enabled ? (
												<IconCheck size={14} />
											) : (
												<IconX size={14} />
											)}
											{key.enabled ? "Active" : "Revoked"}
										</span>
									</div>
									<code className="mt-1 block text-sm text-muted-foreground">
										{key.start ?? key.prefix ?? key.id}
									</code>
									<p className="mt-3 text-xs text-muted-foreground">
										Permissions:{" "}
										{key.permissions?.projects?.join(", ") || "none"} · Created{" "}
										{new Date(key.createdAt).toLocaleDateString()}
										{key.expiresAt
											? ` · Expires ${new Date(key.expiresAt).toLocaleDateString()}`
											: " · No expiration"}
										{key.lastRequest
											? ` · Last used ${new Date(key.lastRequest).toLocaleString()}`
											: " · Never used"}
									</p>
								</div>
								{key.enabled && (
									<button
										type="button"
										className="rounded-lg border px-3 py-2 text-sm text-destructive"
										disabled={submitting}
										onClick={() => void revoke(key.id)}
									>
										Revoke
									</button>
								)}
							</div>
						</article>
					))}
				</div>
			)}
		</section>
	);
}
