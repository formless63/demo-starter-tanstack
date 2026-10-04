import { tryGetCurrentAuthEndpointContext } from "@better-auth/core/context";
import {
	APIError,
	createAuthMiddleware,
	getAuthoritativeSessionFromCtx,
} from "better-auth/api";
import { organization } from "better-auth/plugins/organization";
import {
	invitationEmail,
	messages,
	normalizeOrganizationError,
	type OrganizationCode,
	OrganizationError,
	type OrganizationRole,
	opaqueId,
	organizationConfig,
	organizationName,
	organizationRole,
	organizationSlug,
} from "./validation";

const statuses = {
	configuration: "INTERNAL_SERVER_ERROR",
	"invalid-input": "BAD_REQUEST",
	unauthenticated: "UNAUTHORIZED",
	forbidden: "FORBIDDEN",
	"not-found": "NOT_FOUND",
	conflict: "CONFLICT",
	"limit-exceeded": "PAYLOAD_TOO_LARGE",
	expired: "CONFLICT",
	unsupported: "UNPROCESSABLE_ENTITY",
	timeout: "GATEWAY_TIMEOUT",
	unavailable: "SERVICE_UNAVAILABLE",
	unknown: "INTERNAL_SERVER_ERROR",
} as const;
function apiFailure(code: OrganizationCode): never {
	throw new APIError(statuses[code], {
		code,
		message: messages[code],
		retryable: code === "unavailable" || code === "timeout",
	});
}
function safeFailure(error: unknown): never {
	apiFailure(normalizeOrganizationError(error).code);
}
function fields(value: Record<string, unknown>, allowed: string[]) {
	if (Object.keys(value).some((key) => !allowed.includes(key)))
		throw new OrganizationError("invalid-input");
}
function editFields(value: Record<string, unknown>, create = false) {
	fields(value, ["name", "slug"]);
	return {
		...(create || value.name !== undefined
			? { name: organizationName(value.name) }
			: {}),
		...(create || value.slug !== undefined
			? { slug: organizationSlug(value.slug) }
			: {}),
	};
}
async function actor() {
	const ctx = tryGetCurrentAuthEndpointContext();
	if (!ctx) throw new OrganizationError("forbidden");
	ctx.context.responseHeaders ??= new Headers();
	const responseHeaders = ctx.context.responseHeaders;
	const session = await getAuthoritativeSessionFromCtx({
		...ctx,
		responseHeaders,
	} as Parameters<typeof getAuthoritativeSessionFromCtx>[0]);
	if (!session?.user) throw new OrganizationError("unauthenticated");
	return { ctx, session, userId: opaqueId(session.user.id) };
}
async function actorMember(organizationId: string) {
	const a = await actor();
	const id = opaqueId(organizationId);
	const member = await a.ctx.context.adapter.findOne<{
		id: string;
		userId: string;
		organizationId: string;
		role: string;
	}>({
		model: "member",
		where: [
			{ field: "organizationId", value: id },
			{ field: "userId", value: a.userId },
		],
	});
	if (!member) throw new OrganizationError("not-found");
	return { ...a, member, role: organizationRole(member.role) };
}
function manageable(
	actorRole: OrganizationRole,
	targetRole: unknown,
	newRole?: unknown,
) {
	const target = organizationRole(targetRole);
	const next = newRole === undefined ? undefined : organizationRole(newRole);
	if (
		target === "owner" ||
		next === "owner" ||
		actorRole === "member" ||
		(actorRole === "admin" &&
			(target !== "member" || (next !== undefined && next !== "member")))
	)
		throw new OrganizationError("forbidden");
}
async function invitationAdmission(invite: {
	organizationId: string;
	role: string;
}) {
	const a = await actorMember(invite.organizationId);
	manageable(a.role, invite.role);
	return a;
}
async function acceptance(invite: {
	organizationId: string;
	role: string;
	status: string;
	expiresAt: Date;
	email: string;
}) {
	const a = await actor();
	if (invite.status !== "pending") throw new OrganizationError("conflict");
	if (new Date(invite.expiresAt).getTime() <= Date.now())
		throw new OrganizationError("expired");
	if (organizationRole(invite.role) === "owner")
		throw new OrganizationError("forbidden");
	if (
		!a.session.user.emailVerified ||
		invitationEmail(a.session.user.email) !== invitationEmail(invite.email)
	)
		throw new OrganizationError("forbidden");
}
// Register hooks globally alongside existing application hooks, then register this
// plugin explicitly. No client creation, DB query or provisioning at construction.
export function defineOrganizations(
	source: Record<string, string | undefined> = process.env,
) {
	const config = organizationConfig(source);
	const nativePlugin = organization({
		creatorRole: "owner",
		organizationLimit: config.creationLimit,
		membershipLimit: config.membershipLimit,
		invitationLimit: config.invitationLimit,
		invitationExpiresIn: config.invitationTTL,
		requireEmailVerificationOnInvitation: true,
		disableOrganizationDeletion: true,
		teams: { enabled: false },
		dynamicAccessControl: { enabled: false },
		organizationHooks: {
			beforeCreateOrganization: async ({ organization: org }) => {
				try {
					await actor();
					return { data: editFields(org, true) };
				} catch (error) {
					safeFailure(error);
				}
			},
			beforeUpdateOrganization: async ({ organization: org, member }) => {
				try {
					const a = await actorMember(member.organizationId);
					if (a.role !== "owner") throw new OrganizationError("forbidden");
					return { data: editFields(org) };
				} catch (error) {
					safeFailure(error);
				}
			},
			beforeAddMember: async ({ member }) => {
				try {
					const a = await actor();
					const role = organizationRole(member.role);
					if (role === "owner") {
						if (
							a.ctx.path !== "/organization/create" ||
							member.userId !== a.userId
						)
							throw new OrganizationError("forbidden");
						return;
					}
					await invitationAdmission(member);
				} catch (error) {
					safeFailure(error);
				}
			},
			beforeCreateInvitation: async ({ invitation }) => {
				try {
					await invitationAdmission(invitation);
				} catch (error) {
					safeFailure(error);
				}
			},
			beforeAcceptInvitation: async ({ invitation }) => {
				try {
					await acceptance(invitation);
				} catch (error) {
					safeFailure(error);
				}
			},
			beforeUpdateMemberRole: async ({ member, newRole }) => {
				try {
					const a = await actorMember(member.organizationId);
					manageable(a.role, member.role, newRole);
				} catch (error) {
					safeFailure(error);
				}
			},
			beforeRemoveMember: async ({ member }) => {
				try {
					const a = await actorMember(member.organizationId);
					manageable(a.role, member.role);
				} catch (error) {
					safeFailure(error);
				}
			},
			beforeCancelInvitation: async ({ invitation }) => {
				try {
					await invitationAdmission(invitation);
					if (
						invitation.status !== "pending" &&
						invitation.status !== "canceled"
					)
						throw new OrganizationError("conflict");
				} catch (error) {
					safeFailure(error);
				}
			},
		},
	});
	const plugin = {
		...nativePlugin,
		async onResponse(response: Response) {
			if (response.ok) return;
			const body = (await response
				.clone()
				.json()
				.catch(() => null)) as { code?: unknown; message?: unknown } | null;
			if (!body || typeof body.code !== "string" || !(body.code in messages))
				return;
			const code = body.code as OrganizationCode;
			if (body.message !== messages[code]) return;
			const safe = {
				code,
				message: messages[code],
				retryable: code === "timeout" || code === "unavailable",
			};
			return {
				response: Response.json(safe, {
					status: new APIError(statuses[code], safe).statusCode,
					headers: response.headers,
				}),
			};
		},
	};
	const before = createAuthMiddleware(async (ctx) => {
		if (!ctx.path?.startsWith("/organization/")) return;
		try {
			const a = await actor();
			const body = ctx.body ?? {};
			const orgId = () =>
				opaqueId(
					body.organizationId ??
						(a.session.session as { activeOrganizationId?: string })
							.activeOrganizationId,
				);
			for (const key of [
				"organizationId",
				"memberId",
				"invitationId",
				"userId",
			]) {
				if (body[key] !== undefined && body[key] !== null) opaqueId(body[key]);
			}
			if (ctx.path === "/organization/create") {
				fields(body, ["name", "slug", "keepCurrentActiveOrganization"]);
				Object.assign(
					body,
					editFields({ name: body.name, slug: body.slug }, true),
				);
			}
			if (ctx.path === "/organization/update") {
				fields(body, ["organizationId", "data"]);
				if (
					!body.data ||
					typeof body.data !== "object" ||
					Array.isArray(body.data)
				)
					throw new OrganizationError("invalid-input");
				const m = await actorMember(orgId());
				if (m.role !== "owner") throw new OrganizationError("forbidden");
				body.data = editFields(body.data);
			}
			if (ctx.path === "/organization/invite-member") {
				fields(body, ["organizationId", "email", "role", "resend"]);
				body.email = invitationEmail(body.email);
				body.role = organizationRole(body.role ?? "member");
				const m = await actorMember(orgId());
				manageable(m.role, body.role);
				if (body.resend) {
					const existing = await ctx.context.adapter.findMany<{ role: string }>(
						{
							model: "invitation",
							where: [
								{ field: "organizationId", value: orgId() },
								{ field: "email", value: body.email },
								{ field: "status", value: "pending" },
							],
						},
					);
					for (const i of existing) manageable(m.role, i.role);
				}
			}
			if (ctx.path === "/organization/add-member") {
				fields(body, ["organizationId", "userId", "role"]);
				body.role = organizationRole(body.role ?? "member");
				const m = await actorMember(orgId());
				manageable(m.role, body.role);
			}
			if (
				ctx.path === "/organization/update-member-role" ||
				ctx.path === "/organization/remove-member"
			) {
				const updating = ctx.path === "/organization/update-member-role";
				fields(
					body,
					updating
						? ["organizationId", "memberId", "role"]
						: ["organizationId", "memberIdOrEmail"],
				);
				const acting = await actorMember(orgId());
				const raw = updating ? body.memberId : body.memberIdOrEmail;
				const byEmail = typeof raw === "string" && raw.includes("@");
				let target: { id: string; role: string } | null;
				if (byEmail) {
					const targetUser = await ctx.context.adapter.findOne<{ id: string }>({
						model: "user",
						where: [{ field: "email", value: invitationEmail(raw) }],
					});
					target = targetUser
						? await ctx.context.adapter.findOne({
								model: "member",
								where: [
									{ field: "organizationId", value: orgId() },
									{ field: "userId", value: targetUser.id },
								],
							})
						: null;
				} else
					target = await ctx.context.adapter.findOne({
						model: "member",
						where: [
							{ field: "organizationId", value: orgId() },
							{ field: "id", value: opaqueId(raw) },
						],
					});
				if (!target) throw new OrganizationError("not-found");
				manageable(acting.role, target.role, updating ? body.role : undefined);
			}

			if (ctx.path === "/organization/leave") {
				const m = await actorMember(orgId());
				if (m.role === "owner") throw new OrganizationError("forbidden");
			}
			if (ctx.path === "/organization/delete")
				throw new OrganizationError("unsupported");
			if (
				[
					"/organization/accept-invitation",
					"/organization/reject-invitation",
					"/organization/cancel-invitation",
				].includes(ctx.path)
			) {
				const invite = await ctx.context.adapter.findOne<{
					id: string;
					organizationId: string;
					email: string;
					role: string;
					status: string;
					expiresAt: Date;
					createdAt: Date;
					inviterId: string;
				}>({
					model: "invitation",
					where: [{ field: "id", value: opaqueId(body.invitationId) }],
				});
				if (!invite) throw new OrganizationError("not-found");
				if (ctx.path === "/organization/accept-invitation")
					await acceptance(invite);
				else if (ctx.path === "/organization/reject-invitation") {
					if (
						!a.session.user.emailVerified ||
						invitationEmail(a.session.user.email) !==
							invitationEmail(invite.email)
					)
						throw new OrganizationError("forbidden");
					if (invite.status === "rejected")
						return ctx.json({ invitation: invite, member: null });
					if (invite.status !== "pending")
						throw new OrganizationError("conflict");
				} else {
					await invitationAdmission(invite);
					if (invite.status === "canceled") return ctx.json(invite);
					if (invite.status !== "pending")
						throw new OrganizationError("conflict");
				}
			}
			if (ctx.query) {
				for (const key of ["organizationId", "userId", "id"]) {
					if (ctx.query[key] !== undefined) opaqueId(ctx.query[key]);
				}
				for (const key of ["limit", "membersLimit"]) {
					const value = ctx.query[key];
					if (value !== undefined) {
						if (
							typeof value !== "number" &&
							(typeof value !== "string" || !/^\d+$/.test(value))
						)
							throw new OrganizationError("invalid-input");
						const n = Number(value);
						if (!Number.isInteger(n) || n < 1 || n > 100)
							throw new OrganizationError("invalid-input");
						ctx.query[key] = n;
					} else if (
						(key === "limit" && ctx.path === "/organization/list-members") ||
						(key === "membersLimit" &&
							ctx.path === "/organization/get-full-organization")
					)
						ctx.query[key] = 25;
				}
			}
			return { context: { body, query: ctx.query } };
		} catch (error) {
			if (error instanceof APIError) throw error;
			safeFailure(error);
		}
	});
	const after = createAuthMiddleware(async (ctx) => {
		if (!ctx.path?.startsWith("/organization/")) return;
		const returned = ctx.context.returned;
		if (returned instanceof APIError) {
			const upstream = String(returned.body?.code ?? "");
			let code: OrganizationCode = "unknown";
			if (upstream in messages) code = upstream as OrganizationCode;
			else if (/LIMIT|MAXIMUM/.test(upstream)) code = "limit-exceeded";
			else if (/ALREADY|SLUG/.test(upstream)) code = "conflict";
			else if (/INVITATION_NOT_FOUND/.test(upstream)) code = "conflict";
			else if (/NOT_FOUND|NOT_A_MEMBER|NO_ACTIVE/.test(upstream))
				code = "not-found";
			else if (returned.status === "UNAUTHORIZED") code = "unauthenticated";
			else if (returned.status === "FORBIDDEN") code = "forbidden";
			else if (returned.status === "BAD_REQUEST") code = "invalid-input";
			apiFailure(code);
		}
	});
	return {
		plugin,
		before,
		after,
		config,
		onAPIError: {
			onError(error: unknown) {
				if (error instanceof APIError) throw error;
				safeFailure(error);
			},
		},
	};
}
