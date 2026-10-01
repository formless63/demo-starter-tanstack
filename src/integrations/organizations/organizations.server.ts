import { and, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { invitation, member, organization } from "./schema";
import {
	encodeCursor,
	normalizeOrganizationError,
	OrganizationError,
	type OrganizationRole,
	opaqueId,
	organizationRole,
	pageInput,
} from "./validation";
export type OrganizationReader = Pick<NodePgDatabase, "select" | "execute">;
export type TenantContext = Readonly<{
	scope: Readonly<{ kind: "tenant"; id: string }>;
	userId: string;
	membershipId: string;
	role: OrganizationRole;
}>;
// Caller owns the supplied transaction. These settings bound actual PostgreSQL work.
export async function setOrganizationTransactionBounds(
	tx: Pick<NodePgDatabase, "execute">,
) {
	await tx.execute(sql`SET LOCAL statement_timeout='5s'`);
	await tx.execute(sql`SET LOCAL lock_timeout='2s'`);
}
export async function resolveTenantContext(
	authenticatedUser: { id: string } | null,
	organizationId: string,
	dbOrTx: OrganizationReader,
	{ lock = false }: { lock?: boolean } = {},
): Promise<TenantContext> {
	if (!authenticatedUser) throw new OrganizationError("unauthenticated");
	const userId = opaqueId(authenticatedUser.id);
	const id = opaqueId(organizationId);
	try {
		const query = dbOrTx
			.select()
			.from(member)
			.where(and(eq(member.userId, userId), eq(member.organizationId, id)))
			.limit(1);
		const [row] = await (lock ? query.for("share") : query);
		if (!row) throw new OrganizationError("not-found");
		return Object.freeze({
			scope: Object.freeze({ kind: "tenant" as const, id }),
			userId,
			membershipId: row.id,
			role: organizationRole(row.role),
		});
	} catch (error) {
		throw normalizeOrganizationError(error);
	}
}
export async function listOwnOrganizations(
	user: { id: string } | null,
	dbOrTx: OrganizationReader,
	input: { limit?: number; cursor?: string } = {},
) {
	if (!user) throw new OrganizationError("unauthenticated");
	const userId = opaqueId(user.id);
	const { limit, cursor } = pageInput(input);
	try {
		const rows = await dbOrTx
			.select({
				id: organization.id,
				name: organization.name,
				slug: organization.slug,
				createdAt: organization.createdAt,
			})
			.from(organization)
			.innerJoin(
				member,
				and(
					eq(member.organizationId, organization.id),
					eq(member.userId, userId),
				),
			)
			.where(
				cursor
					? sql`(${organization.createdAt},${organization.id}) < (${cursor.createdAt},${cursor.id})`
					: undefined,
			)
			.orderBy(desc(organization.createdAt), desc(organization.id))
			.limit(limit + 1);
		return {
			items: rows.slice(0, limit),
			nextCursor: rows.length > limit ? encodeCursor(rows[limit - 1]) : null,
		};
	} catch (error) {
		throw normalizeOrganizationError(error);
	}
}
export async function listOrganizationMembers(
	user: { id: string } | null,
	organizationId: string,
	dbOrTx: OrganizationReader,
	input: { limit?: number; cursor?: string } = {},
) {
	const context = await resolveTenantContext(user, organizationId, dbOrTx);
	const { limit, cursor } = pageInput(input);
	try {
		const rows = await dbOrTx
			.select({
				id: member.id,
				userId: member.userId,
				role: member.role,
				createdAt: member.createdAt,
			})
			.from(member)
			.where(
				and(
					eq(member.organizationId, context.scope.id),
					cursor
						? sql`(${member.createdAt},${member.id}) < (${cursor.createdAt},${cursor.id})`
						: undefined,
				),
			)
			.orderBy(desc(member.createdAt), desc(member.id))
			.limit(limit + 1);
		return {
			items: rows.slice(0, limit),
			nextCursor: rows.length > limit ? encodeCursor(rows[limit - 1]) : null,
		};
	} catch (error) {
		throw normalizeOrganizationError(error);
	}
}
// Read-only operator diagnostic. Explicit operator authority is created by application code,
// never from request JSON. IDs/action-capable invitation details are not default logs.
export async function diagnoseOrganizationAdmission(
	dbOrTx: OrganizationReader,
	operator: { kind: "operator" },
	organizationId: string,
) {
	if (operator?.kind !== "operator") throw new OrganizationError("forbidden");
	const id = opaqueId(organizationId);
	try {
		const owners = await dbOrTx
			.select({ id: member.id })
			.from(member)
			.where(and(eq(member.organizationId, id), eq(member.role, "owner")));
		const inconsistencies = await dbOrTx
			.select({ id: invitation.id })
			.from(invitation)
			.where(
				and(
					eq(invitation.organizationId, id),
					eq(invitation.status, "accepted"),
					sql`NOT EXISTS (SELECT 1 FROM ${member} m JOIN "user" u ON u.id=m.user_id WHERE m.organization_id=${invitation.organizationId} AND lower(u.email)=lower(${invitation.email}))`,
				),
			);
		return {
			hasSingleOwner: owners.length === 1,
			acceptedWithoutMembership: inconsistencies.map((row) => ({
				invitationId: row.id,
			})),
		};
	} catch (error) {
		throw normalizeOrganizationError(error);
	}
}
