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
export async function changeProjectForOwner(
	ownerId: string,
	data: ProjectData & { id: string },
) {
	const [project] = await db
		.update(projects)
		.set({
			name: data.name.trim(),
			description: data.description?.trim() || null,
			updatedAt: new Date(),
		})
		.where(and(eq(projects.id, data.id), eq(projects.ownerId, ownerId)))
		.returning();
	if (!project) throw new Error("NOT_FOUND");
	return project;
}
export async function changeProject(data: ProjectData & { id: string }) {
	const user = await requireUser();
	return changeProjectForOwner(user.id, data);
}
export async function removeProjectForOwner(ownerId: string, id: string) {
	const [project] = await db
		.delete(projects)
		.where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
		.returning({ id: projects.id });
	if (!project) throw new Error("NOT_FOUND");
	return project;
}
export async function removeProject(id: string) {
	const user = await requireUser();
	return removeProjectForOwner(user.id, id);
}
