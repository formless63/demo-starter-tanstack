import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "#/db";
import { apikey, user } from "#/db/schema";
import { createProjectApi } from "#/integrations/api-platform/projects-api.server";
import { queryAuditEvents } from "#/integrations/audit-log/audit.server";
import { auth } from "#/lib/auth";
import {
	changeProjectForOwner,
	findProjectsForOwner,
	insertProjectForOwner,
	removeProjectForOwner,
} from "./projects.server";

const ownerId = `audit-owner-${crypto.randomUUID()}`;
describe("Projects audit wiring", () => {
	beforeAll(async () => {
		await db.insert(user).values({
			id: ownerId,
			name: "Private name",
			email: `${ownerId}@example.test`,
		});
	});
	afterAll(async () => {
		await db.delete(apikey).where(eq(apikey.referenceId, ownerId));
		await db.delete(user).where(eq(user.id, ownerId));
	});
	it("records create, update, and delete with stable user IDs and explicitly chosen context only", async () => {
		const project = await insertProjectForOwner(ownerId, {
			name: "Private project name",
			description: "Private body",
		});
		await changeProjectForOwner(ownerId, {
			id: project.id,
			name: "Changed private name",
			description: "secret body",
		});
		await removeProjectForOwner(ownerId, project.id);
		const { events } = await queryAuditEvents(db, {
			subjectType: "project",
			subjectId: project.id,
		});
		expect(events.map((row) => row.action).sort()).toEqual([
			"projects.create",
			"projects.delete",
			"projects.update",
		]);
		for (const row of events)
			expect(row).toMatchObject({
				actorType: "user",
				actorId: ownerId,
				outcome: "success",
				requestId: null,
			});
		expect(
			events.find((row) => row.action === "projects.create")?.metadata,
		).toEqual({ source: "application" });
		expect(
			events.find((row) => row.action === "projects.update")?.metadata,
		).toEqual({ fields: ["name", "description"] });
		expect(JSON.stringify(events)).not.toMatch(
			/Private|secret body|example.test|password|token|headers/,
		);
		await findProjectsForOwner(ownerId);
		expect(
			(await queryAuditEvents(db, { subjectId: project.id })).events,
		).toHaveLength(3);
	});
	it("rolls a project create back if its required audit input fails", async () => {
		await expect(
			insertProjectForOwner(
				ownerId,
				{ name: "Must roll back", description: null },
				{ type: "bad type" },
			),
		).rejects.toThrow("Invalid audit log input");
		expect(await findProjectsForOwner(ownerId)).toHaveLength(0);
	});
	it("can map a safe machine principal without importing API Platform into Audit Log", async () => {
		const project = await insertProjectForOwner(
			ownerId,
			{ name: "Machine project", description: null },
			{ type: "machine", id: "safe-key-id" },
		);
		expect(
			(await queryAuditEvents(db, { subjectId: project.id })).events[0],
		).toMatchObject({
			actorType: "machine",
			actorId: "safe-key-id",
			metadata: { source: "api" },
		});
		await removeProjectForOwner(ownerId, project.id);
	});
	it("maps verified API credentials to their safe machine ID and omits the credential/body", async () => {
		const key = await auth.api.createApiKey({
			body: {
				userId: ownerId,
				name: "audit fixture",
				permissions: { projects: ["write"] },
			},
		});
		const response = await createProjectApi(
			new Request("http://localhost/api/v1/projects", {
				method: "POST",
				headers: { "x-api-key": key.key, "content-type": "application/json" },
				body: JSON.stringify({
					name: "API private body",
					description: "Do not copy this",
				}),
			}),
		);
		expect(response.status).toBe(201);
		const body = await response.json();
		const { events } = await queryAuditEvents(db, { subjectId: body.data.id });
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			actorType: "machine",
			actorId: key.id,
			action: "projects.create",
			outcome: "success",
			metadata: { source: "api" },
		});
		expect(JSON.stringify(events)).not.toContain(key.key);
		expect(JSON.stringify(events)).not.toContain("API private body");
		expect(JSON.stringify(events)).not.toContain("Do not copy this");
		await removeProjectForOwner(ownerId, body.data.id);
	});
});
