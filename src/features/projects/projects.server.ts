import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "#/db";
import { projects } from "#/db/schema";
import { auth } from "#/lib/auth";
import type { ProjectData } from "./project-schema";

export async function requireUser() {
	const session = await auth.api.getSession({ headers: getRequestHeaders() });
	if (!session?.user) throw new Error("UNAUTHORIZED");
	return session.user;
}
export async function currentUser() {
	return requireUser();
}
export async function findProjects() {
	const user = await requireUser();
	return db
		.select()
		.from(projects)
		.where(eq(projects.ownerId, user.id))
		.orderBy(desc(projects.updatedAt));
}
export async function insertProject(data: ProjectData) {
	const user = await requireUser();
	const [project] = await db
		.insert(projects)
		.values({
			id: crypto.randomUUID(),
			ownerId: user.id,
			name: data.name.trim(),
			description: data.description?.trim() || null,
		})
		.returning();
	return project;
}
export async function changeProject(data: ProjectData & { id: string }) {
	const user = await requireUser();
	const [project] = await db
		.update(projects)
		.set({
			name: data.name.trim(),
			description: data.description?.trim() || null,
			updatedAt: new Date(),
		})
		.where(and(eq(projects.id, data.id), eq(projects.ownerId, user.id)))
		.returning();
	if (!project) throw new Error("NOT_FOUND");
	return project;
}
export async function removeProject(id: string) {
	const user = await requireUser();
	const [project] = await db
		.delete(projects)
		.where(and(eq(projects.id, id), eq(projects.ownerId, user.id)))
		.returning({ id: projects.id });
	if (!project) throw new Error("NOT_FOUND");
	return project;
}
