import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "#/db";
import { projects, user } from "#/db/schema";
import {
	changeProjectForOwner,
	findProjectsForOwner,
	removeProjectForOwner,
} from "./projects.server";

const userAId = `auth-user-a-${crypto.randomUUID()}`;
const userBId = `auth-user-b-${crypto.randomUUID()}`;
const projectId = crypto.randomUUID();

describe("PostgreSQL project authorization", () => {
	beforeAll(async () => {
		await db.insert(user).values([
			{ id: userAId, name: "User A", email: `${userAId}@example.test` },
			{ id: userBId, name: "User B", email: `${userBId}@example.test` },
		]);
		await db.insert(projects).values({
			id: projectId,
			ownerId: userAId,
			name: "User A project",
			description: "private",
		});
	});

	afterAll(async () => {
		await db.delete(user).where(eq(user.id, userAId));
		await db.delete(user).where(eq(user.id, userBId));
	});

	it("allows the owner to read and denies another user's read, update, and delete", async () => {
		await expect(findProjectsForOwner(userAId)).resolves.toEqual([
			expect.objectContaining({ id: projectId, name: "User A project" }),
		]);
		await expect(findProjectsForOwner(userBId)).resolves.not.toEqual(
			expect.arrayContaining([expect.objectContaining({ id: projectId })]),
		);
		await expect(
			changeProjectForOwner(userBId, {
				id: projectId,
				name: "Hijacked",
				description: null,
			}),
		).rejects.toThrow("NOT_FOUND");
		await expect(removeProjectForOwner(userBId, projectId)).rejects.toThrow(
			"NOT_FOUND",
		);

		const [persisted] = await db
			.select()
			.from(projects)
			.where(eq(projects.id, projectId));
		expect(persisted).toMatchObject({
			id: projectId,
			ownerId: userAId,
			name: "User A project",
		});
	});
});
