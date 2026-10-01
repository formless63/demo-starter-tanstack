import { IconBuilding, IconCopy } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	addOrganizationNote,
	deleteOrganizationNote,
	getOrganizationSummary,
	listOrganizations,
} from "#/features/organizations/organizations.functions";
import { authClient } from "#/lib/auth-client";
export const Route = createFileRoute("/app/organizations")({
	validateSearch: (search: Record<string, unknown>) => ({
		invitation:
			typeof search.invitation === "string" ? search.invitation : undefined,
	}),
	component: OrganizationsPage,
});
function OrganizationsPage() {
	const search = Route.useSearch();
	const client = useQueryClient();
	const session = authClient.useSession();
	const [selected, setSelected] = useState<string>(
		session.data?.session.activeOrganizationId ?? "",
	);
	useEffect(
		() => setSelected(session.data?.session.activeOrganizationId ?? ""),
		[session.data?.session.activeOrganizationId],
	);
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"member" | "admin">("member");
	const [title, setTitle] = useState("");
	const organizations = useQuery({
		queryKey: ["organizations"],
		queryFn: () => listOrganizations(),
	});
	const summary = useQuery({
		queryKey: ["organization-summary", selected],
		enabled: Boolean(selected),
		queryFn: ({ signal }) =>
			getOrganizationSummary({ data: { organizationId: selected }, signal }),
	});
	const invitations = useQuery({
		queryKey: ["organization-invitations", selected],
		enabled:
			Boolean(selected) &&
			Boolean(summary.data) &&
			summary.data?.context.role !== "member",
		queryFn: async () => {
			const response = await authClient.organization.listInvitations({
				query: { organizationId: selected },
			});
			if (response.error) throw new Error("Invitation list unavailable");
			return response.data.slice(0, 25);
		},
	});
	async function refresh() {
		await Promise.all([
			client.invalidateQueries({ queryKey: ["organizations"] }),
			client.invalidateQueries({ queryKey: ["organization-summary"] }),
			client.invalidateQueries({ queryKey: ["organization-invitations"] }),
		]);
	}
	async function operation(run: () => Promise<unknown>, success = "Saved.") {
		setBusy(true);
		setMessage("");
		try {
			const result = await run();
			if (
				result &&
				typeof result === "object" &&
				"error" in result &&
				result.error
			)
				throw new Error("Operation denied");
			await refresh();
			setMessage(success);
		} catch {
			setMessage(
				"Unable to complete this organization operation. Refresh and verify your membership before trying again.",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<section className="space-y-6">
			<h1 className="flex items-center gap-2 text-3xl font-semibold">
				<IconBuilding /> Organizations
			</h1>
			<p className="text-muted-foreground">
				Select a shared workspace. Your personal Projects stay personal.
			</p>
			<output aria-live="polite">{message}</output>
			<label className="block">
				Active organization
				<select
					aria-label="Active organization"
					className="ml-3 rounded border p-2"
					value={selected}
					disabled={busy}
					onChange={(event) => {
						const id = event.target.value;
						void operation(
							async () => {
								const result = await authClient.organization.setActive({
									organizationId: id || null,
								});
								if (!result.error) setSelected(id);
								return result;
							},
							id ? "Workspace selected." : "Selection cleared.",
						);
					}}
				>
					<option value="">Personal workspace</option>
					{organizations.data?.items.map((org) => (
						<option key={org.id} value={org.id}>
							{org.name}
						</option>
					))}
				</select>
			</label>
			<form
				className="space-y-3 rounded-lg border p-4"
				onSubmit={(event) => {
					event.preventDefault();
					void operation(
						() => authClient.organization.create({ name, slug }),
						"Organization created.",
					);
				}}
			>
				<h2 className="font-semibold">Create organization</h2>
				<label className="block">
					Name
					<input
						className="ml-3 rounded border p-2"
						required
						maxLength={100}
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
				</label>
				<label className="block">
					Slug
					<input
						className="ml-3 rounded border p-2"
						required
						minLength={3}
						maxLength={63}
						value={slug}
						onChange={(event) => setSlug(event.target.value)}
					/>
				</label>
				<button
					className="rounded border px-3 py-2"
					disabled={busy}
					type="submit"
				>
					Create
				</button>
			</form>
			{search.invitation && (
				<div className="space-x-3 rounded-lg border p-4">
					<p>Invitation acceptance requires your matching verified email.</p>
					<button
						type="button"
						disabled={busy}
						onClick={() =>
							void operation(
								() =>
									authClient.organization.acceptInvitation({
										invitationId: search.invitation ?? "",
									}),
								"Invitation accepted.",
							)
						}
					>
						Accept invitation
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={() =>
							void operation(
								() =>
									authClient.organization.rejectInvitation({
										invitationId: search.invitation ?? "",
									}),
								"Invitation rejected.",
							)
						}
					>
						Reject invitation
					</button>
				</div>
			)}
			{selected && summary.isError && (
				<p role="alert">
					This workspace is unavailable or your membership has changed. Clear
					the selection or refresh.
				</p>
			)}
			{summary.data && selected && (
				<>
					<div className="rounded-lg border p-4">
						<h2 className="font-semibold">Members</h2>
						<ul>
							{summary.data.members.map((member) => (
								<li className="flex items-center gap-3 py-2" key={member.id}>
									<span>
										{member.userId} — {member.role}
									</span>
									{member.role !== "owner" &&
										summary.data.context.role !== "member" &&
										(summary.data.context.role === "owner" ||
											member.role === "member") && (
											<>
												<button
													type="button"
													disabled={busy}
													onClick={() =>
														void operation(() =>
															authClient.organization.removeMember({
																organizationId: selected,
																memberIdOrEmail: member.id,
															}),
														)
													}
												>
													Remove
												</button>
												{summary.data.context.role === "owner" && (
													<button
														type="button"
														disabled={busy}
														onClick={() =>
															void operation(() =>
																authClient.organization.updateMemberRole({
																	organizationId: selected,
																	memberId: member.id,
																	role:
																		member.role === "admin"
																			? "member"
																			: "admin",
																}),
															)
														}
													>
														{member.role === "admin"
															? "Make member"
															: "Make admin"}
													</button>
												)}
											</>
										)}
								</li>
							))}
						</ul>
						{summary.data.context.role !== "owner" && (
							<button
								type="button"
								disabled={busy}
								onClick={() =>
									void operation(async () => {
										const result = await authClient.organization.leave({
											organizationId: selected,
										});
										if (!result.error) setSelected("");
										return result;
									}, "Organization left.")
								}
							>
								Leave organization
							</button>
						)}
					</div>
					{summary.data.context.role === "owner" && (
						<form
							className="space-y-3 rounded-lg border p-4"
							onSubmit={(event) => {
								event.preventDefault();
								const data = new FormData(event.currentTarget);
								void operation(() =>
									authClient.organization.update({
										organizationId: selected,
										data: {
											name: String(data.get("name")),
											slug: String(data.get("slug")),
										},
									}),
								);
							}}
						>
							<h2 className="font-semibold">Organization settings</h2>
							<label>
								Name
								<input
									name="name"
									required
									maxLength={100}
									className="ml-3 rounded border p-2"
								/>
							</label>
							<label>
								Slug
								<input
									name="slug"
									required
									minLength={3}
									maxLength={63}
									className="ml-3 rounded border p-2"
								/>
							</label>
							<button type="submit" disabled={busy}>
								Save settings
							</button>
						</form>
					)}
					{summary.data.context.role !== "member" && (
						<form
							className="space-y-3 rounded-lg border p-4"
							onSubmit={(event) => {
								event.preventDefault();
								void operation(
									() =>
										authClient.organization.inviteMember({
											organizationId: selected,
											email,
											role:
												summary.data?.context.role === "owner"
													? role
													: "member",
										}),
									"Invitation created. No email was sent; copy the invitation link below.",
								);
							}}
						>
							<h2 className="font-semibold">Invite member</h2>
							<label>
								Email
								<input
									className="ml-3 rounded border p-2"
									type="email"
									required
									maxLength={254}
									value={email}
									onChange={(event) => setEmail(event.target.value)}
								/>
							</label>
							{summary.data.context.role === "owner" && (
								<label>
									Role
									<select
										className="ml-3 rounded border p-2"
										value={role}
										onChange={(event) =>
											setRole(event.target.value as "member" | "admin")
										}
									>
										<option value="member">Member</option>
										<option value="admin">Admin</option>
									</select>
								</label>
							)}
							<button disabled={busy} type="submit">
								Create invitation
							</button>
							<ul>
								{invitations.data
									?.filter((invitation) => invitation.status === "pending")
									.map((invitation) => (
										<li className="flex gap-3" key={invitation.id}>
											{invitation.email}
											<button
												type="button"
												aria-label="Copy invitation link"
												onClick={() =>
													void navigator.clipboard.writeText(
														`${window.location.origin}/app/organizations?invitation=${encodeURIComponent(invitation.id)}`,
													)
												}
											>
												<IconCopy size={18} />
											</button>
											<button
												type="button"
												disabled={busy}
												onClick={() =>
													void operation(
														() =>
															authClient.organization.cancelInvitation({
																invitationId: invitation.id,
															}),
														"Invitation cancelled.",
													)
												}
											>
												Cancel
											</button>
										</li>
									))}
							</ul>
						</form>
					)}
					<div className="rounded-lg border p-4">
						<h2 className="font-semibold">Organization notes</h2>
						<ul>
							{summary.data.notes.map((note) => (
								<li className="flex gap-3 py-2" key={note.id}>
									{note.title}
									{summary.data.context.role !== "member" && (
										<button
											disabled={busy}
											type="button"
											onClick={() =>
												void operation(() =>
													deleteOrganizationNote({
														data: { organizationId: selected, id: note.id },
													}),
												)
											}
										>
											Delete note
										</button>
									)}
								</li>
							))}
						</ul>
						{summary.data.context.role !== "member" && (
							<form
								onSubmit={(event) => {
									event.preventDefault();
									void operation(() =>
										addOrganizationNote({
											data: { organizationId: selected, title },
										}),
									);
								}}
							>
								<label>
									Note title
									<input
										required
										maxLength={120}
										className="ml-3 rounded border p-2"
										value={title}
										onChange={(event) => setTitle(event.target.value)}
									/>
								</label>
								<button type="submit" disabled={busy}>
									Add note
								</button>
							</form>
						)}
					</div>
				</>
			)}
		</section>
	);
}
