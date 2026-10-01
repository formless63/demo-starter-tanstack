import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";
import { db } from "#/db";
import {
	authorizationAssignments,
	member,
	organization,
	user,
} from "#/db/schema";
import {
	applicationPolicy,
	personalPolicyContext,
} from "#/lib/application-policy.server";
import {
	findProjectsForOwner,
	insertProjectForOwner,
} from "../projects/projects.server";

const owner = `policy-owner-${randomUUID()}`,
	subject = `policy-member-${randomUUID()}`,
	other = `policy-other-${randomUUID()}`,
	tenant = `policy-tenant-${randomUUID()}`;
beforeAll(async () => {
	await db.insert(user).values(
		[owner, subject, other].map((id) => ({
			id,
			name: "Policy fixture",
			email: `${id}@example.test`,
		})),
	);
	await db.insert(organization).values({
		id: tenant,
		name: "Policy fixture",
		slug: tenant,
		createdAt: new Date(),
	});
	await db.insert(member).values([
		{
			id: randomUUID(),
			organizationId: tenant,
			userId: owner,
			role: "owner",
			createdAt: new Date(),
		},
		{
			id: randomUUID(),
			organizationId: tenant,
			userId: subject,
			role: "member",
			createdAt: new Date(),
		},
	]);
});
afterAll(async () => {
	await db
		.delete(authorizationAssignments)
		.where(eq(authorizationAssignments.scopeId, tenant));
	await db.delete(member).where(eq(member.organizationId, tenant));
	await db.delete(organization).where(eq(organization.id, tenant));
	await db.delete(user).where(inArray(user.id, [owner, subject, other]));
});
test("personal scope and resource identity remain mandatory beside organization ownership", async () => {
	const own = personalPolicyContext(owner);
	expect(
		await applicationPolicy.can(db, own, "projects.read", { ownerId: owner }),
	).toBe(true);
	expect(
		await applicationPolicy.can(db, own, "projects.read", { ownerId: other }),
	).toBe(false);
	expect(
		await applicationPolicy.can(
			db,
			{ userId: owner, scope: { kind: "tenant", id: tenant } },
			"projects.read",
			{ ownerId: owner },
		),
	).toBe(false);
	await expect(findProjectsForOwner(other, own)).rejects.toMatchObject({
		code: "forbidden",
	});
	await expect(
		insertProjectForOwner(
			other,
			{ name: "Denied", description: null },
			undefined,
			own,
		),
	).rejects.toMatchObject({ code: "forbidden" });
});
test("owner-guarded persisted read-only assignment cannot outlive authoritative membership", async () => {
	const actor = personalPolicyContext(owner),
		target = {
			scope: { kind: "tenant" as const, id: tenant },
			userId: subject,
			roleId: "demo-read-only",
		},
		context = { userId: subject, scope: target.scope };
	await expect(
		applicationPolicy.grantRole(db, personalPolicyContext(subject), target),
	).rejects.toMatchObject({ code: "forbidden" });
	const grant = await applicationPolicy.grantRole(db, actor, target);
	expect(grant.changed).toBe(true);
	if (!grant.assignment)
		throw new Error("Fixture grant did not return an assignment.");
	expect(
		(
			await applicationPolicy.listAssignments(db, actor, target.scope)
		).items.map((row) => row.roleId),
	).toContain("demo-read-only");
	expect(await applicationPolicy.can(db, context, "notes.read")).toBe(true);
	expect(await applicationPolicy.can(db, context, "notes.write")).toBe(false);
	await db
		.delete(member)
		.where(and(eq(member.organizationId, tenant), eq(member.userId, subject)));
	expect(await applicationPolicy.can(db, context, "notes.read")).toBe(false);
	expect(
		await db
			.select()
			.from(authorizationAssignments)
			.where(eq(authorizationAssignments.id, grant.assignment.id)),
	).toHaveLength(1);
	await applicationPolicy.revokeRole(db, actor, target);
	expect((await applicationPolicy.revokeRole(db, actor, target)).changed).toBe(
		false,
	);
});
