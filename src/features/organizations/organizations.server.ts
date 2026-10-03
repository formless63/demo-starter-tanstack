import {
	getRequestHeaders,
	setResponseHeader,
} from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "#/db";
import { AuthorizationError } from "#/integrations/authorization/validation";
import {
	listOrganizationMembers,
	listOwnOrganizations,
	resolveTenantContext,
	setOrganizationTransactionBounds,
} from "#/integrations/organizations/organizations.server";
import { organization } from "#/integrations/organizations/schema";
import {
	normalizeOrganizationError,
	OrganizationError,
	opaqueId,
} from "#/integrations/organizations/validation";
import { applicationPolicy } from "#/lib/application-policy.server";
import { auth } from "#/lib/auth";
import { organizationNotes } from "./schema";

async function actor() {
	setResponseHeader("Cache-Control", "private, no-store");
	setResponseHeader("Vary", "Cookie");
	const session = await auth.api.getSession({ headers: getRequestHeaders() });
	if (!session?.user) throw new OrganizationError("unauthenticated");
	return session.user;
}
export async function ownOrganizations(input: { cursor?: string } = {}) {
	const user = await actor();
	if (!input || typeof input !== "object" || Array.isArray(input))
		throw new OrganizationError("invalid-input");
	try {
		return await db.transaction(async (tx) => {
			await setOrganizationTransactionBounds(tx);
			return listOwnOrganizations(user, tx, { cursor: input.cursor });
		});
	} catch (error) {
		if (error instanceof AuthorizationError)
			throw new OrganizationError(
				error.code === "forbidden"
					? "forbidden"
					: error.code === "timeout"
						? "timeout"
						: "unavailable",
			);
		throw normalizeOrganizationError(error);
	}
}
export async function organizationSummary(id: string, cursor?: string) {
	const user = await actor();
	try {
		return await db.transaction(async (tx) => {
			await setOrganizationTransactionBounds(tx);
			const context = await resolveTenantContext(user, id, tx);
			await applicationPolicy.requirePermissionInTransaction(
				tx,
				context,
				"notes.read",
			);
			const [details] = await tx
				.select({
					id: organization.id,
					name: organization.name,
					slug: organization.slug,
				})
				.from(organization)
				.where(eq(organization.id, context.scope.id))
				.limit(1);
			if (!details) throw new OrganizationError("not-found");
			const members = await listOrganizationMembers(user, id, tx, { cursor });
			const notes = await tx
				.select()
				.from(organizationNotes)
				.where(eq(organizationNotes.organizationId, context.scope.id))
				.orderBy(desc(organizationNotes.createdAt), desc(organizationNotes.id))
				.limit(25);
			return {
				context,
				organization: details,
				members: members.items,
				membersNextCursor: members.nextCursor,
				notes,
			};
		});
	} catch (error) {
		if (error instanceof AuthorizationError)
			throw new OrganizationError(
				error.code === "forbidden"
					? "forbidden"
					: error.code === "timeout"
						? "timeout"
						: "unavailable",
			);
		throw normalizeOrganizationError(error);
	}
}
export async function createNote(input: {
	organizationId: string;
	title: string;
}) {
	const user = await actor();
	if (!input || typeof input !== "object" || Array.isArray(input))
		throw new OrganizationError("invalid-input");
	const organizationId = opaqueId(input.organizationId);
	if (typeof input.title !== "string")
		throw new OrganizationError("invalid-input");
	const title = input.title.trim();
	if (
		title.length < 1 ||
		title.length > 120 ||
		Array.from(title).some(
			(c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
		)
	)
		throw new OrganizationError("invalid-input");
	try {
		return await db.transaction(async (tx) => {
			await setOrganizationTransactionBounds(tx);
			const context = await resolveTenantContext(user, organizationId, tx, {
				lock: true,
			});
			await applicationPolicy.requirePermissionInTransaction(
				tx,
				context,
				"notes.write",
			);
			const [note] = await tx
				.insert(organizationNotes)
				.values({
					id: crypto.randomUUID(),
					organizationId: context.scope.id,
					title,
				})
				.returning();
			return note;
		});
	} catch (error) {
		if (error instanceof AuthorizationError)
			throw new OrganizationError(
				error.code === "forbidden"
					? "forbidden"
					: error.code === "timeout"
						? "timeout"
						: "unavailable",
			);
		throw normalizeOrganizationError(error);
	}
}
export async function removeNote(input: {
	organizationId: string;
	id: string;
}) {
	const user = await actor();
	if (!input || typeof input !== "object" || Array.isArray(input))
		throw new OrganizationError("invalid-input");
	const organizationId = opaqueId(input.organizationId);
	const id = opaqueId(input.id);
	try {
		return await db.transaction(async (tx) => {
			await setOrganizationTransactionBounds(tx);
			const context = await resolveTenantContext(user, organizationId, tx, {
				lock: true,
			});
			const [existing] = await tx
				.select({ id: organizationNotes.id })
				.from(organizationNotes)
				.where(
					and(
						eq(organizationNotes.organizationId, context.scope.id),
						eq(organizationNotes.id, id),
					),
				)
				.for("update");
			if (!existing) throw new OrganizationError("not-found");
			await applicationPolicy.requirePermissionInTransaction(
				tx,
				context,
				"notes.write",
			);
			const [note] = await tx
				.delete(organizationNotes)
				.where(
					and(
						eq(organizationNotes.organizationId, context.scope.id),
						eq(organizationNotes.id, id),
					),
				)
				.returning({ id: organizationNotes.id });
			if (!note) throw new OrganizationError("not-found");
			return note;
		});
	} catch (error) {
		if (error instanceof AuthorizationError)
			throw new OrganizationError(
				error.code === "forbidden"
					? "forbidden"
					: error.code === "timeout"
						? "timeout"
						: "unavailable",
			);
		throw normalizeOrganizationError(error);
	}
}

export async function getNote(input: { organizationId: string; id: string }) {
	const user = await actor();
	if (!input || typeof input !== "object")
		throw new OrganizationError("invalid-input");
	const organizationId = opaqueId(input.organizationId),
		id = opaqueId(input.id);
	try {
		return await db.transaction(async (tx) => {
			await setOrganizationTransactionBounds(tx);
			const context = await resolveTenantContext(user, organizationId, tx);
			const [note] = await tx
				.select()
				.from(organizationNotes)
				.where(
					and(
						eq(organizationNotes.organizationId, context.scope.id),
						eq(organizationNotes.id, id),
					),
				)
				.limit(1);
			if (!note) throw new OrganizationError("not-found");
			await applicationPolicy.requirePermissionInTransaction(
				tx,
				context,
				"notes.read",
			);
			return note;
		});
	} catch (error) {
		if (error instanceof AuthorizationError)
			throw new OrganizationError(
				error.code === "forbidden"
					? "forbidden"
					: error.code === "timeout"
						? "timeout"
						: "unavailable",
			);
		throw normalizeOrganizationError(error);
	}
}
export async function updateNote(input: {
	organizationId: string;
	id: string;
	title: string;
}) {
	const user = await actor();
	if (!input || typeof input !== "object")
		throw new OrganizationError("invalid-input");
	const organizationId = opaqueId(input.organizationId),
		id = opaqueId(input.id);
	if (typeof input.title !== "string")
		throw new OrganizationError("invalid-input");
	const title = input.title.trim();
	if (
		title.length < 1 ||
		title.length > 120 ||
		Array.from(title).some(
			(c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
		)
	)
		throw new OrganizationError("invalid-input");
	try {
		return await db.transaction(async (tx) => {
			await setOrganizationTransactionBounds(tx);
			const context = await resolveTenantContext(user, organizationId, tx, {
				lock: true,
			});
			const predicate = and(
				eq(organizationNotes.organizationId, context.scope.id),
				eq(organizationNotes.id, id),
			);
			const [existing] = await tx
				.select({ id: organizationNotes.id })
				.from(organizationNotes)
				.where(predicate)
				.for("update");
			if (!existing) throw new OrganizationError("not-found");
			await applicationPolicy.requirePermissionInTransaction(
				tx,
				context,
				"notes.write",
			);
			const [note] = await tx
				.update(organizationNotes)
				.set({ title, updatedAt: new Date() })
				.where(predicate)
				.returning();
			return note;
		});
	} catch (error) {
		if (error instanceof AuthorizationError)
			throw new OrganizationError(
				error.code === "forbidden"
					? "forbidden"
					: error.code === "timeout"
						? "timeout"
						: "unavailable",
			);
		throw normalizeOrganizationError(error);
	}
}
