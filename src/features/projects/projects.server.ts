import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "#/db";
import { projects } from "#/db/schema";
import {
	appendAuditEvent,
	createAuditActor,
	createAuditSubject,
} from "#/integrations/audit-log/audit.server";
import type { AuditIdentity } from "#/integrations/audit-log/validation";
import {
	safeSearch,
	searchAfter,
	searchPage,
	searchQuery,
	searchRank,
	searchTimestamp,
} from "#/integrations/search/search.server";
import {
	parseSearchInput,
	type SearchRequest,
} from "#/integrations/search/validation";
import { auth } from "#/lib/auth";
import { createNotificationInTransaction } from "../../integrations/notifications/transaction.server";
import {
	applicationRealtime,
	recipientChannel,
} from "../../lib/realtime-hub.server";
import type { ProjectData } from "./project-schema";

const projectFields = {
	id: projects.id,
	name: projects.name,
	description: projects.description,
	ownerId: projects.ownerId,
	createdAt: projects.createdAt,
	updatedAt: projects.updatedAt,
};

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
		.select(projectFields)
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
			.returning(projectFields);
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
			.returning(projectFields);
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

export async function searchProjectsForOwner(
	ownerId: string,
	request: SearchRequest,
) {
	const input = parseSearchInput(request);
	const query = searchQuery(input.query);
	const rank = searchRank(projects.searchVector, query);
	return safeSearch(async () => {
		const rows = await db
			.select({
				row: projectFields,
				rankText: sql<string>`${rank}::text`,
				updatedAtText: searchTimestamp(projects.updatedAt),
				id: projects.id,
			})
			.from(projects)
			.where(
				and(
					eq(projects.ownerId, ownerId),
					sql`${projects.searchVector} @@ ${query}`,
					searchAfter(rank, projects.updatedAt, projects.id, input.cursor),
				),
			)
			.orderBy(desc(rank), desc(projects.updatedAt), desc(projects.id))
			.limit(input.limit + 1);
		return searchPage(rows, input.limit);
	});
}
export async function searchProjects(request: SearchRequest) {
	const user = await requireUser();
	return searchProjectsForOwner(user.id, request);
}
