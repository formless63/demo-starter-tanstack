import {
	type AuthorizationContext,
	defineAuthorization,
} from "#/integrations/authorization/authorization.server";
import { AuthorizationError } from "#/integrations/authorization/validation";
import { resolveTenantContext } from "#/integrations/organizations/organizations.server";
import { OrganizationError } from "#/integrations/organizations/validation";
export function personalPolicyContext(userId: string): AuthorizationContext {
	return Object.freeze({
		userId,
		scope: Object.freeze({ kind: "user", id: userId }),
	});
}
export const applicationPolicy = defineAuthorization(
	{
		actions: [
			{
				id: "projects.read",
				resource: (context, resource) =>
					context.scope.kind === "user" &&
					context.scope.id === context.userId &&
					(resource as { ownerId?: string } | undefined)?.ownerId ===
						context.userId,
			},
			{
				id: "projects.create",
				resource: (context, resource) =>
					context.scope.kind === "user" &&
					context.scope.id === context.userId &&
					(resource as { ownerId?: string } | undefined)?.ownerId ===
						context.userId,
			},
			{
				id: "projects.update",
				resource: (context, resource) =>
					context.scope.kind === "user" &&
					context.scope.id === context.userId &&
					(resource as { ownerId?: string } | undefined)?.ownerId ===
						context.userId,
			},
			{
				id: "projects.delete",
				resource: (context, resource) =>
					context.scope.kind === "user" &&
					context.scope.id === context.userId &&
					(resource as { ownerId?: string } | undefined)?.ownerId ===
						context.userId,
			},
			{ id: "notes.read" },
			{ id: "notes.write" },
		],
		roles: [
			{
				id: "personal-owner",
				actions: [
					"projects.read",
					"projects.create",
					"projects.update",
					"projects.delete",
				],
			},
			{ id: "tenant-reader", actions: ["notes.read"] },
			{ id: "tenant-editor", actions: ["notes.read", "notes.write"] },
			{ id: "demo-read-only", actions: ["notes.read"] },
		],
	},
	{
		tenantMembership: async (userId, tenantId, tx) => {
			try {
				await resolveTenantContext({ id: userId }, tenantId, tx, {
					lock: true,
				});
				return true;
			} catch (error) {
				if (error instanceof OrganizationError && error.code === "not-found")
					return false;
				throw new AuthorizationError("unavailable");
			}
		},
		mappedRoles: async (context, tx) => {
			if (context.scope.kind === "user")
				return context.scope.id === context.userId ? ["personal-owner"] : [];
			const membership = await resolveTenantContext(
				{ id: context.userId as string },
				context.scope.id,
				tx,
				{ lock: true },
			);
			return [membership.role === "member" ? "tenant-reader" : "tenant-editor"];
		},
		managementGuard: async (actor, target, operation, tx) => {
			if (target.kind !== "tenant" || !actor.userId) return false;
			try {
				const membership = await resolveTenantContext(
					{ id: actor.userId },
					target.id,
					tx,
					{ lock: true },
				);
				return (
					membership.role === "owner" &&
					(operation === "grant" ||
						operation === "revoke" ||
						operation === "list")
				);
			} catch (error) {
				if (error instanceof OrganizationError && error.code === "not-found")
					return false;
				throw new AuthorizationError("unavailable");
			}
		},
	},
);
