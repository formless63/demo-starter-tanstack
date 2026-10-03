import type { db } from "../../db";
import { projects } from "../../db/schema";
import {
	appendAuditEvent,
	createAuditActor,
	createAuditSubject,
} from "../../integrations/audit-log/audit.server";
import type { AuditIdentity } from "../../integrations/audit-log/validation";
import type { AuthorizationContext } from "../../integrations/authorization/authorization.server";
import {
	applicationPolicy,
	personalPolicyContext,
} from "../../lib/application-policy.server";
import type { ProjectData } from "./project-schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Caller owns the transaction; domain and optional application Audit commit together. */
export async function insertProjectInTransaction(
	tx: Transaction,
	ownerId: string,
	data: ProjectData,
	actor: AuditIdentity = createAuditActor("user", ownerId),
	context: AuthorizationContext = personalPolicyContext(ownerId),
) {
	// Both direct writes and durable personal imports decide inside the caller transaction.
	await applicationPolicy.requirePermissionInTransaction(
		tx,
		context,
		"projects.create",
		{ ownerId },
	);
	const [project] = await tx
		.insert(projects)
		.values({
			id: crypto.randomUUID(),
			ownerId,
			name: data.name.trim(),
			description: data.description?.trim() || null,
		})
		.returning({
			id: projects.id,
			ownerId: projects.ownerId,
			name: projects.name,
			description: projects.description,
			createdAt: projects.createdAt,
			updatedAt: projects.updatedAt,
		});
	await appendAuditEvent(tx, {
		actor,
		action: "projects.create",
		subject: createAuditSubject("project", project.id),
		outcome: "success",
		metadata: { source: actor.type === "machine" ? "api" : "application" },
	});
	return project;
}
