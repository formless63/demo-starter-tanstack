import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "#/db";
import {
	listOrganizationMembers,
	listOwnOrganizations,
	resolveTenantContext,
	setOrganizationTransactionBounds,
} from "#/integrations/organizations/organizations.server";
import {
	normalizeOrganizationError,
	OrganizationError,
	opaqueId,
} from "#/integrations/organizations/validation";
import { auth } from "#/lib/auth";
import { organizationNotes } from "./schema";

async function actor() {
	const session = await auth.api.getSession({ headers: getRequestHeaders() });
	if (!session?.user) throw new OrganizationError("unauthenticated");
	return session.user;
}
export async function ownOrganizations() {
	const user = await actor();
	try {
		return await db.transaction(async (tx) => {
			await setOrganizationTransactionBounds(tx);
			return listOwnOrganizations(user, tx);
		});
	} catch (error) {
		throw normalizeOrganizationError(error);
	}
}
export async function organizationSummary(id: string) {
	const user = await actor();
	try {
		return await db.transaction(async (tx) => {
			await setOrganizationTransactionBounds(tx);
			const context = await resolveTenantContext(user, id, tx);
			const members = await listOrganizationMembers(user, id, tx);
			const notes = await tx
				.select()
				.from(organizationNotes)
				.where(eq(organizationNotes.organizationId, context.scope.id))
				.orderBy(desc(organizationNotes.createdAt), desc(organizationNotes.id))
				.limit(25);
			return { context, members: members.items, notes };
		});
	} catch (error) {
		throw normalizeOrganizationError(error);
	}
}
export async function createNote(input: {
	organizationId: string;
	title: string;
}) {
	const user = await actor();
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
			if (context.role === "member") throw new OrganizationError("forbidden");
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
		throw normalizeOrganizationError(error);
	}
}
export async function removeNote(input: {
	organizationId: string;
	id: string;
}) {
	const user = await actor();
	const organizationId = opaqueId(input.organizationId);
	const id = opaqueId(input.id);
	try {
		return await db.transaction(async (tx) => {
			await setOrganizationTransactionBounds(tx);
			const context = await resolveTenantContext(user, organizationId, tx, {
				lock: true,
			});
			if (context.role === "member") throw new OrganizationError("forbidden");
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
		throw normalizeOrganizationError(error);
	}
}
