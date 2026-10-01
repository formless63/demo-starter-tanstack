import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "#/db";
import { projects } from "#/db/schema";
import {
	appendAuditEvent,
	createAuditActor,
	createAuditSubject,
} from "#/integrations/audit-log/audit.server";
import type { AuditIdentity } from "#/integrations/audit-log/validation";
import { auth } from "#/lib/auth";
import { createNotificationInTransaction } from "../../integrations/notifications/transaction.server";
import {
	applicationRealtime,
	recipientChannel,
} from "../../lib/realtime-hub.server";
import type { ProjectData } from "./project-schema";

export async function requireUser() {
	const session = await auth.api.getSession({ headers: getRequestHeaders() });
	if (!session?.user) throw new Error("UNAUTHORIZED");
	return session.user;
}
export async function currentUser() {
	const session = await auth.api.getSession({ headers: getRequestHeaders() });
	return session?.user ?? null;
}
export async function findProjectsForOwner(ownerId: string) {
	return db
		.select()
		.from(projects)
		.where(eq(projects.ownerId, ownerId))
		.orderBy(desc(projects.updatedAt));
}
export async function findProjects() {
	const user = await requireUser();
	return findProjectsForOwner(user.id);
}
export async function insertProject(data: ProjectData) {
	const user = await requireUser();
	return insertProjectForOwner(user.id, data);
}
export async function insertProjectForOwner(
	ownerId: string,
	data: ProjectData,
	actor: AuditIdentity = createAuditActor("user", ownerId),
) {
	const result = await db.transaction(async (tx) => {
		const [project] = await tx
			.insert(projects)
			.values({
				id: crypto.randomUUID(),
				ownerId,
				name: data.name.trim(),
				description: data.description?.trim() || null,
			})
			.returning();
		await appendAuditEvent(tx, {
			actor,
			action: "projects.create",
			subject: createAuditSubject("project", project.id),
			outcome: "success",
			metadata: { source: actor.type === "machine" ? "api" : "application" },
		});
		const { notification } = await createNotificationInTransaction(tx, {
			recipientId: ownerId,
			type: "projects.created",
			title: "Project created",
			body: "Your project is ready.",
			metadata: { projectId: project.id },
		});
		return { project, notification };
	});
	try {
		applicationRealtime.publish(
			recipientChannel(ownerId),
			"notifications.created",
			{ notificationId: result.notification.id },
		);
	} catch {
		/* Already committed; hint is optional. */
	}
	return result.project;
}
export async function changeProjectForOwner(
	ownerId: string,
	data: ProjectData & { id: string },
) {
	return db.transaction(async (tx) => {
		const [project] = await tx
			.update(projects)
			.set({
				name: data.name.trim(),
				description: data.description?.trim() || null,
				updatedAt: new Date(),
			})
			.where(and(eq(projects.id, data.id), eq(projects.ownerId, ownerId)))
			.returning();
		if (!project) throw new Error("NOT_FOUND");
		await appendAuditEvent(tx, {
			actor: createAuditActor("user", ownerId),
			action: "projects.update",
			subject: createAuditSubject("project", project.id),
			outcome: "success",
			metadata: { fields: ["name", "description"] },
		});
		return project;
	});
}
export async function changeProject(data: ProjectData & { id: string }) {
	const user = await requireUser();
	return changeProjectForOwner(user.id, data);
}
export async function removeProjectForOwner(ownerId: string, id: string) {
	return db.transaction(async (tx) => {
		const [project] = await tx
			.delete(projects)
			.where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
			.returning({ id: projects.id });
		if (!project) throw new Error("NOT_FOUND");
		await appendAuditEvent(tx, {
			actor: createAuditActor("user", ownerId),
			action: "projects.delete",
			subject: createAuditSubject("project", project.id),
			outcome: "success",
			metadata: {},
		});
		return project;
	});
}
export async function removeProject(id: string) {
	const user = await requireUser();
	return removeProjectForOwner(user.id, id);
}
