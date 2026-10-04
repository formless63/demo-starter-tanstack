import { IconBuilding, IconCopy } from "@tabler/icons-react";
import {
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
	copyOrganizationInvitation,
	currentOrganizationRequest,
	type OrganizationDraft,
	pendingOrganizationInvitations,
	reconcileOrganizationDraft,
	uniqueOrganizationRows,
} from "#/features/organizations/organization-ui";
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
	const session = authClient.useSession();
	if (!session.data?.user)
		return (
			<p>
				{session.isPending
					? "Loading organizations…"
					: "Sign in to view organizations."}
			</p>
		);
	return (
		<OrganizationWorkspace
			key={`${session.data.user.id}:${session.data.session.id}`}
			userId={session.data.user.id}
			activeOrganizationId={session.data.session.activeOrganizationId ?? ""}
			invitation={search.invitation}
		/>
	);
}
function OrganizationWorkspace({
	userId,
	activeOrganizationId,
	invitation,
}: {
	userId: string;
	activeOrganizationId: string;
	invitation?: string;
}) {
	const client = useQueryClient();
	const [selected, setSelected] = useState(activeOrganizationId);
	useEffect(() => setSelected(activeOrganizationId), [activeOrganizationId]);
	const mounted = useRef(true);
	const currentSelection = useRef({ id: selected });
	if (currentSelection.current.id !== selected)
		currentSelection.current = { id: selected };
	const selectionScope = currentSelection.current;
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const [message, setMessage] = useState<{
		scope: { id: string };
		text: string;
	} | null>(null);
	const [busy, setBusy] = useState(false);
	const operationPending = useRef(false);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"member" | "admin">("member");
	const [title, setTitle] = useState("");
	const [invitationLimit, setInvitationLimit] = useState(25);
	const [createdInvitation, setCreatedInvitation] = useState<{
		id: string;
		email: string;
		organizationId: string;
	} | null>(null);
	const previousSelection = useRef(selected);
	useEffect(() => {
		if (previousSelection.current === selected) return;
		previousSelection.current = selected;
		setEmail("");
		setRole("member");
		setTitle("");
		setInvitationLimit(25);
		setCreatedInvitation(null);
	}, [selected]);
	const organizations = useInfiniteQuery({
		queryKey: ["organizations", userId],
		gcTime: 0,
		staleTime: 0,
		retry: false,
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam, signal }) =>
			currentOrganizationRequest(signal, () =>
				listOrganizations({ data: { cursor: pageParam }, signal }),
			),
		getNextPageParam: (page) => page.nextCursor ?? undefined,
	});
	const summaryQuery = useInfiniteQuery({
		queryKey: ["organization-summary", userId, selected],
		gcTime: 0,
		staleTime: 0,
		retry: false,
		enabled: Boolean(selected),
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam, signal }) =>
			currentOrganizationRequest(signal, () =>
				getOrganizationSummary({
					data: { organizationId: selected, cursor: pageParam },
					signal,
				}),
			),
		getNextPageParam: (page) => page.membersNextCursor ?? undefined,
	});
	// Never render retained authority after an unsuccessful page/refetch.
	const summary = summaryQuery.isSuccess
		? summaryQuery.data.pages[0]
		: undefined;
	const members = summary
		? uniqueOrganizationRows(
				summaryQuery.data?.pages.flatMap((page) => page.members) ?? [],
			)
		: [];
	const organizationRows = organizations.isSuccess
		? uniqueOrganizationRows(
				organizations.data.pages.flatMap((page) => page.items),
			)
		: [];
	const invitations = useQuery({
		queryKey: ["organization-invitations", userId, selected],
		gcTime: 0,
		staleTime: 0,
		retry: false,
		enabled:
			Boolean(selected) &&
			Boolean(summary) &&
			summary?.context.role !== "member",
		queryFn: ({ signal }) =>
			currentOrganizationRequest(signal, async () => {
				const response = await authClient.organization.listInvitations({
					query: { organizationId: selected },
					fetchOptions: { signal, cache: "no-store" },
				});
				if (response.error) throw new Error("Invitation list unavailable");
				// Native Better Auth lists all statuses without a cursor. Page only
				// the pending, deterministically ordered browser projection.
				return pendingOrganizationInvitations(response.data);
			}),
	});
	const pendingInvitations = invitations.isSuccess ? invitations.data : [];
	async function refresh() {
		await Promise.all([
			client.invalidateQueries({ queryKey: ["organizations", userId] }),
			client.invalidateQueries({
				queryKey: ["organization-summary", userId, selected],
			}),
			client.invalidateQueries({
				queryKey: ["organization-invitations", userId, selected],
			}),
		]);
	}
	async function operation(
		run: () => Promise<unknown>,
		success = "Saved.",
		nextSelection?: string,
	) {
		if (operationPending.current) return false;
		operationPending.current = true;
		let operationScope = selectionScope;
		const isCurrent = () =>
			mounted.current && currentSelection.current === operationScope;
		setBusy(true);
		setMessage(null);
		try {
			const result = await run();
			if (
				result &&
				typeof result === "object" &&
				"error" in result &&
				result.error
			)
				throw new Error("Operation denied");
			if (!mounted.current) return false;
			if (nextSelection !== undefined && isCurrent()) {
				operationScope = { id: nextSelection };
				currentSelection.current = operationScope;
				setSelected(nextSelection);
			}
			await refresh();
			if (isCurrent()) setMessage({ scope: operationScope, text: success });
			return isCurrent();
		} catch {
			if (isCurrent())
				setMessage({
					scope: operationScope,
					text: "Unable to complete this organization operation. Refresh and verify your membership before trying again.",
				});
			return false;
		} finally {
			operationPending.current = false;
			if (mounted.current) setBusy(false);
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
			<output aria-live="polite">
				{message?.scope === selectionScope ? message.text : ""}
			</output>
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
							() =>
								authClient.organization.setActive({
									organizationId: id || null,
								}),
							id ? "Workspace selected." : "Selection cleared.",
							id,
						);
					}}
				>
					<option value="">Personal workspace</option>
					{selected && !organizationRows.some((org) => org.id === selected) && (
						<option value={selected}>
							{summary?.organization.name ?? "Selected organization"}
						</option>
					)}
					{organizationRows.map((org) => (
						<option key={org.id} value={org.id}>
							{org.name}
						</option>
					))}
				</select>
			</label>
			{organizations.isError && (
				<p role="alert">
					Could not load organizations.{" "}
					<button type="button" onClick={() => void organizations.refetch()}>
						Try again
					</button>
				</p>
			)}
			{organizations.isPending && <p>Loading organizations…</p>}
			{organizations.isSuccess && organizations.hasNextPage && (
				<button
					type="button"
					disabled={busy || organizations.isFetching}
					onClick={() => void organizations.fetchNextPage()}
				>
					{organizations.isFetchingNextPage
						? "Loading organizations…"
						: "Load more organizations"}
				</button>
			)}
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
			{invitation && (
				<div className="space-x-3 rounded-lg border p-4">
					<p>Invitation acceptance requires your matching verified email.</p>
					<button
						type="button"
						disabled={busy}
						onClick={() =>
							void operation(
								() =>
									authClient.organization.acceptInvitation({
										invitationId: invitation ?? "",
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
										invitationId: invitation ?? "",
									}),
								"Invitation rejected.",
							)
						}
					>
						Reject invitation
					</button>
				</div>
			)}
			{selected && summaryQuery.isError && (
				<p role="alert">
					This workspace is unavailable or your membership has changed. Clear
					the selection or{" "}
					<button type="button" onClick={() => void summaryQuery.refetch()}>
						refresh
					</button>
					.
				</p>
			)}
			{summary && selected && (
				<>
					<div className="rounded-lg border p-4">
						<h2 className="font-semibold">Members</h2>
						<ul>
							{members.map((member) => (
								<li className="flex items-center gap-3 py-2" key={member.id}>
									<span>
										{member.userId} — {member.role}
									</span>
									{member.role !== "owner" &&
										summary.context.role !== "member" &&
										(summary.context.role === "owner" ||
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
												{summary.context.role === "owner" && (
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
						{summaryQuery.hasNextPage && (
							<button
								type="button"
								disabled={busy || summaryQuery.isFetching}
								onClick={() => void summaryQuery.fetchNextPage()}
							>
								{summaryQuery.isFetchingNextPage
									? "Loading members…"
									: "Load more members"}
							</button>
						)}
						{summary.context.role !== "owner" && (
							<button
								type="button"
								disabled={busy}
								onClick={() =>
									void operation(
										() =>
											authClient.organization.leave({
												organizationId: selected,
											}),
										"Organization left.",
										"",
									)
								}
							>
								Leave organization
							</button>
						)}
					</div>
					{summary.context.role === "owner" && (
						<OrganizationSettings
							key={selected}
							organization={summary.organization}
							busy={busy}
							operation={operation}
						/>
					)}
					{summary.context.role !== "member" && (
						<form
							className="space-y-3 rounded-lg border p-4"
							onSubmit={(event) => {
								event.preventDefault();
								void operation(async () => {
									const response = await authClient.organization.inviteMember({
										organizationId: selected,
										email,
										role: summary?.context.role === "owner" ? role : "member",
									});
									if (
										!response.error &&
										response.data &&
										mounted.current &&
										currentSelection.current === selectionScope
									)
										setCreatedInvitation({
											id: response.data.id,
											email: response.data.email,
											organizationId: selected,
										});
									return response;
								}, "Invitation created. No email was sent; copy the invitation link below.");
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
							{summary.context.role === "owner" && (
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
							{createdInvitation?.organizationId === selected && (
								<div className="space-y-2 rounded border p-3">
									<p>
										Invitation created for {createdInvitation.email}. No email
										was sent.
									</p>
									<InvitationLink
										key={createdInvitation.id}
										invitation={createdInvitation}
										showLink
									/>
								</div>
							)}
							<h3 className="font-medium">Pending invitations</h3>
							{invitations.isPending && <p>Loading invitations…</p>}
							{invitations.isError && (
								<p role="alert">
									Could not load invitations.{" "}
									<button
										type="button"
										onClick={() => void invitations.refetch()}
									>
										Try again
									</button>
								</p>
							)}
							{invitations.isSuccess && pendingInvitations.length === 0 && (
								<p>No pending invitations.</p>
							)}
							<ul>
								{pendingInvitations.slice(0, invitationLimit).map((pending) => (
									<li
										className="flex flex-wrap items-center gap-3 py-2"
										key={pending.id}
									>
										<span>{pending.email}</span>
										<InvitationLink invitation={pending} />
										<button
											type="button"
											disabled={busy}
											aria-label={`Cancel invitation for ${pending.email}`}
											onClick={() =>
												void operation(async () => {
													const response =
														await authClient.organization.cancelInvitation({
															invitationId: pending.id,
														});
													if (
														!response.error &&
														mounted.current &&
														currentSelection.current === selectionScope
													)
														setCreatedInvitation((current) =>
															current?.id === pending.id ? null : current,
														);
													return response;
												}, "Invitation cancelled.")
											}
										>
											Cancel
										</button>
									</li>
								))}
							</ul>
							{pendingInvitations.length > invitationLimit && (
								<button
									type="button"
									onClick={() => setInvitationLimit((limit) => limit + 25)}
								>
									Load more invitations
								</button>
							)}
						</form>
					)}
					<div className="rounded-lg border p-4">
						<h2 className="font-semibold">Organization notes</h2>
						<ul>
							{summary.notes.map((note) => (
								<li className="flex gap-3 py-2" key={note.id}>
									<span>{note.title}</span>
									{summary.context.role !== "member" && (
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
						{summary.context.role !== "member" && (
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

function OrganizationSettings({
	organization,
	busy,
	operation,
}: {
	organization: { id: string; name: string; slug: string };
	busy: boolean;
	operation: (
		run: () => Promise<unknown>,
		success?: string,
	) => Promise<boolean>;
}) {
	const [draft, setDraft] = useState<OrganizationDraft>({
		name: organization.name,
		slug: organization.slug,
		dirty: false,
	});
	useEffect(() => {
		setDraft((current) =>
			reconcileOrganizationDraft(current, {
				name: organization.name,
				slug: organization.slug,
			}),
		);
	}, [organization.name, organization.slug]);
	return (
		<form
			className="space-y-3 rounded-lg border p-4"
			onSubmit={(event) => {
				event.preventDefault();
				void operation(async () => {
					const response = await authClient.organization.update({
						organizationId: organization.id,
						data: { name: draft.name, slug: draft.slug },
					});
					if (!response.error && response.data)
						setDraft({
							name: response.data.name,
							slug: response.data.slug,
							dirty: false,
						});
					return response;
				});
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
					disabled={busy}
					value={draft.name}
					onChange={(event) =>
						setDraft({ ...draft, name: event.target.value, dirty: true })
					}
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
					disabled={busy}
					value={draft.slug}
					onChange={(event) =>
						setDraft({ ...draft, slug: event.target.value, dirty: true })
					}
				/>
			</label>
			<button type="submit" disabled={busy}>
				Save settings
			</button>
		</form>
	);
}

function InvitationLink({
	invitation,
	showLink = false,
}: {
	invitation: { id: string; email: string };
	showLink?: boolean;
}) {
	const [link, setLink] = useState("");
	const [feedback, setFeedback] = useState<"copied" | "manual" | null>(null);
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		setLink(
			`${window.location.origin}/app/organizations?invitation=${encodeURIComponent(invitation.id)}`,
		);
		return () => {
			mounted.current = false;
		};
	}, [invitation.id]);
	return (
		<div className="space-y-2">
			<button
				type="button"
				disabled={!link}
				aria-label={`Copy invitation link for ${invitation.email}`}
				onClick={async () => {
					const result = await copyOrganizationInvitation(
						link,
						navigator.clipboard?.writeText.bind(navigator.clipboard),
					);
					if (mounted.current) setFeedback(result);
				}}
			>
				<IconCopy size={18} />
			</button>
			{(showLink || feedback === "manual") && (
				<label className="block">
					Invitation link for {invitation.email}
					<input
						className="ml-3 w-full rounded border p-2"
						readOnly
						value={link}
						onFocus={(event) => event.currentTarget.select()}
					/>
				</label>
			)}
			<output aria-live="polite">
				{feedback === "copied"
					? "Invitation link copied."
					: feedback === "manual"
						? "Clipboard unavailable. Select and copy the link above."
						: ""}
			</output>
		</div>
	);
}
