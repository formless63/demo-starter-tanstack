import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { authorizationAssignments as assignments } from "./schema";
import {
	type AuthorizationCode,
	AuthorizationError,
	actionId,
	cursorFor,
	exactScope,
	opaqueId,
	pageInput,
	type Scope,
	safeError,
} from "./validation";
export type AuthorizationTransaction = Pick<
	NodePgDatabase,
	"select" | "insert" | "delete" | "execute"
>;
export interface AuthorizationDatabase {
	transaction<T>(run: (tx: AuthorizationTransaction) => Promise<T>): Promise<T>;
}
export interface AuthorizationContext {
	readonly userId?: string;
	readonly scope: Scope;
	readonly credentialAllows?: (action: string) => boolean;
}
export type DecisionReason =
	| "allowed"
	| "unauthenticated"
	| "unknown-action"
	| "no-grant"
	| "scope-mismatch"
	| "resource-denied"
	| "error";
export type AuthorizationDecision = Readonly<{
	allowed: boolean;
	reason: DecisionReason;
	errorCode?: AuthorizationCode;
}>;
export interface ActionDefinition {
	readonly id: string;
	readonly resource?: (
		context: AuthorizationContext,
		resource: unknown,
		tx: AuthorizationTransaction,
	) => boolean | Promise<boolean>;
}
export interface AuthorizationRegistry {
	readonly actions: readonly ActionDefinition[];
	readonly roles: readonly { id: string; actions: readonly string[] }[];
}
export interface AuthorizationOptions {
	readonly tenantMembership?: (
		userId: string,
		tenantId: string,
		tx: AuthorizationTransaction,
	) => boolean | Promise<boolean>;
	readonly mappedRoles?: (
		context: AuthorizationContext,
		tx: AuthorizationTransaction,
	) => readonly string[] | Promise<readonly string[]>;
	readonly managementGuard?: (
		actor: AuthorizationContext,
		target: Scope,
		operation: "grant" | "revoke" | "list",
		tx: AuthorizationTransaction,
	) => boolean | Promise<boolean>;
	readonly audit?: (
		tx: AuthorizationTransaction,
		event: {
			action: "authorization.grant" | "authorization.revoke";
			subjectId: string;
			outcome: "success";
		},
	) => Promise<void>;
}
export async function setAuthorizationTransactionBounds(
	tx: Pick<NodePgDatabase, "execute">,
) {
	await tx.execute(sql`SET LOCAL statement_timeout='5s'`);
	await tx.execute(sql`SET LOCAL lock_timeout='2s'`);
}
export function defineAuthorization(
	registry: AuthorizationRegistry,
	options: AuthorizationOptions = {},
) {
	const actions = new Map<string, ActionDefinition>();
	const roles = new Map<string, ReadonlySet<string>>();
	try {
		if (
			!registry ||
			registry.actions.length > 256 ||
			registry.roles.length > 64
		)
			throw 0;
		for (const action of registry.actions) {
			const id = actionId(action.id);
			if (
				actions.has(id) ||
				(action.resource !== undefined && typeof action.resource !== "function")
			)
				throw 0;
			actions.set(id, Object.freeze({ ...action, id }));
		}
		for (const role of registry.roles) {
			const id = actionId(role.id, 64, false);
			if (roles.has(id) || role.actions.length > 256) throw 0;
			const grants = new Set(role.actions);
			if (
				grants.size !== role.actions.length ||
				[...grants].some((action) => !actions.has(action))
			)
				throw 0;
			roles.set(id, grants);
		}
	} catch {
		throw new AuthorizationError("configuration");
	}
	async function verify(
		context: AuthorizationContext,
		tx: AuthorizationTransaction,
	): Promise<DecisionReason | undefined> {
		if (!context?.userId) return "unauthenticated";
		try {
			opaqueId(context.userId);
			exactScope(context.scope);
		} catch {
			return "scope-mismatch";
		}
		if (context.scope.kind === "user")
			return context.scope.id === context.userId ? undefined : "scope-mismatch";
		if (
			!options.tenantMembership ||
			!(await options.tenantMembership(context.userId, context.scope.id, tx))
		)
			return "scope-mismatch";
	}
	async function authorizeInTransaction(
		tx: AuthorizationTransaction,
		context: AuthorizationContext,
		action: string,
		resource?: unknown,
	): Promise<AuthorizationDecision> {
		try {
			await setAuthorizationTransactionBounds(tx);
			const denied = await verify(context, tx);
			if (denied) return { allowed: false, reason: denied };
			const definition = actions.get(action);
			if (!definition) return { allowed: false, reason: "unknown-action" };
			// Shared subject/scope lock linearizes evaluation+protected write with grant/revoke.
			await tx.execute(
				sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${JSON.stringify([context.scope.kind, context.scope.id, context.userId])},0))`,
			);
			const rows = await tx
				.select({ roleId: assignments.roleId })
				.from(assignments)
				.where(
					and(
						eq(assignments.scopeKind, context.scope.kind),
						eq(assignments.scopeId, context.scope.id),
						eq(assignments.userId, context.userId as string),
					),
				);
			const mapped = (await options.mappedRoles?.(context, tx)) ?? [];
			if (
				![...rows.map((row) => row.roleId), ...mapped].some((role) =>
					roles.get(role)?.has(action),
				)
			)
				return { allowed: false, reason: "no-grant" };
			if (context.credentialAllows && !context.credentialAllows(action))
				return { allowed: false, reason: "no-grant" };
			if (
				definition.resource &&
				(resource === undefined ||
					!(await definition.resource(context, resource, tx)))
			)
				return { allowed: false, reason: "resource-denied" };
			return { allowed: true, reason: "allowed" };
		} catch (error) {
			return {
				allowed: false,
				reason: "error",
				errorCode: safeError(error).code,
			};
		}
	}
	async function authorize(
		db: AuthorizationDatabase,
		context: AuthorizationContext,
		action: string,
		resource?: unknown,
	): Promise<AuthorizationDecision> {
		try {
			return await db.transaction(async (tx) => {
				await setAuthorizationTransactionBounds(tx);
				return authorizeInTransaction(tx, context, action, resource);
			});
		} catch (error) {
			return {
				allowed: false,
				reason: "error",
				errorCode: safeError(error).code,
			};
		}
	}
	async function requirePermissionInTransaction(
		tx: AuthorizationTransaction,
		context: AuthorizationContext,
		action: string,
		resource?: unknown,
	) {
		const decision = await authorizeInTransaction(
			tx,
			context,
			action,
			resource,
		);
		if (!decision.allowed)
			throw new AuthorizationError(
				decision.reason === "error"
					? (decision.errorCode ?? "unavailable")
					: decision.reason === "unauthenticated"
						? "unauthenticated"
						: "forbidden",
			);
		return decision;
	}
	async function guard(
		tx: AuthorizationTransaction,
		actor: AuthorizationContext,
		scope: Scope,
		operation: "grant" | "revoke" | "list",
	) {
		if (!actor?.userId) throw new AuthorizationError("unauthenticated");
		opaqueId(actor.userId);
		exactScope(actor.scope);
		if (await verify(actor, tx)) throw new AuthorizationError("forbidden");
		if (
			!options.managementGuard ||
			!(await options.managementGuard(actor, scope, operation, tx))
		)
			throw new AuthorizationError("forbidden");
	}
	async function mutate(
		tx: AuthorizationTransaction,
		actor: AuthorizationContext,
		input: { scope: Scope; userId: string; roleId: string },
		operation: "grant" | "revoke",
	) {
		if (!input || typeof input !== "object" || Array.isArray(input))
			throw new AuthorizationError("invalid-input");
		const scope = exactScope(input.scope),
			userId = opaqueId(input.userId),
			roleId = actionId(input.roleId, 64, false);
		if (!roles.has(roleId)) throw new AuthorizationError("invalid-input");
		try {
			await setAuthorizationTransactionBounds(tx);
			await guard(tx, actor, scope, operation);
			if (
				operation === "grant" &&
				scope.kind === "tenant" &&
				(!options.tenantMembership ||
					!(await options.tenantMembership(userId, scope.id, tx)))
			)
				throw new AuthorizationError("not-found");
			// Transaction-scoped subject/scope lock serializes the 64-assignment bound;
			// collisions only serialize unrelated subjects. No cross-request cache.
			await tx.execute(
				sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([scope.kind, scope.id, userId])},0))`,
			);
			const predicate = and(
				eq(assignments.scopeKind, scope.kind),
				eq(assignments.scopeId, scope.id),
				eq(assignments.userId, userId),
				eq(assignments.roleId, roleId),
			);
			const [existing] = await tx
				.select()
				.from(assignments)
				.where(predicate)
				.limit(1);
			if (operation === "grant") {
				if (existing) return { changed: false, assignment: existing };
				const [{ count }] = await tx
					.select({ count: sql<number>`count(*)::int` })
					.from(assignments)
					.where(
						and(
							eq(assignments.scopeKind, scope.kind),
							eq(assignments.scopeId, scope.id),
							eq(assignments.userId, userId),
						),
					);
				if (count >= 64) throw new AuthorizationError("conflict");
				const [created] = await tx
					.insert(assignments)
					.values({
						id: randomUUID(),
						scopeKind: scope.kind,
						scopeId: scope.id,
						userId,
						roleId,
						createdAt: new Date(),
					})
					.returning();
				await options.audit?.(tx, {
					action: "authorization.grant",
					subjectId: created.id,
					outcome: "success",
				});
				return { changed: true, assignment: created };
			}
			if (!existing) return { changed: false, assignment: null };
			await tx.delete(assignments).where(predicate);
			await options.audit?.(tx, {
				action: "authorization.revoke",
				subjectId: existing.id,
				outcome: "success",
			});
			return { changed: true, assignment: null };
		} catch (error) {
			throw safeError(error);
		}
	}
	async function listAssignmentsInTransaction(
		tx: AuthorizationTransaction,
		actor: AuthorizationContext,
		scopeInput: Scope,
		input: { limit?: number; cursor?: string } = {},
	) {
		const scope = exactScope(scopeInput),
			{ limit, cursor } = pageInput(input);
		try {
			await setAuthorizationTransactionBounds(tx);
			await guard(tx, actor, scope, "list");
			const rows = await tx
				.select()
				.from(assignments)
				.where(
					and(
						eq(assignments.scopeKind, scope.kind),
						eq(assignments.scopeId, scope.id),
						cursor
							? sql`(${assignments.createdAt},${assignments.id})<(${cursor.createdAt},${cursor.id})`
							: undefined,
					),
				)
				.orderBy(desc(assignments.createdAt), desc(assignments.id))
				.limit(limit + 1);
			return {
				items: rows.slice(0, limit),
				nextCursor: rows.length > limit ? cursorFor(rows[limit - 1]) : null,
			};
		} catch (error) {
			throw safeError(error);
		}
	}
	async function owned<T>(
		db: AuthorizationDatabase,
		run: (tx: AuthorizationTransaction) => Promise<T>,
	): Promise<T> {
		try {
			return await db.transaction(run);
		} catch (error) {
			throw safeError(error);
		}
	}
	return Object.freeze({
		authorizeInTransaction,
		authorize,
		can: async (
			db: AuthorizationDatabase,
			context: AuthorizationContext,
			action: string,
			resource?: unknown,
		) => (await authorize(db, context, action, resource)).allowed,
		requirePermissionInTransaction,
		requirePermission: async (
			db: AuthorizationDatabase,
			context: AuthorizationContext,
			action: string,
			resource?: unknown,
		) =>
			owned(db, async (tx) => {
				await setAuthorizationTransactionBounds(tx);
				return requirePermissionInTransaction(tx, context, action, resource);
			}),
		grantRoleInTransaction: (
			tx: AuthorizationTransaction,
			actor: AuthorizationContext,
			input: { scope: Scope; userId: string; roleId: string },
		) => mutate(tx, actor, input, "grant"),
		revokeRoleInTransaction: (
			tx: AuthorizationTransaction,
			actor: AuthorizationContext,
			input: { scope: Scope; userId: string; roleId: string },
		) => mutate(tx, actor, input, "revoke"),
		grantRole: (
			db: AuthorizationDatabase,
			actor: AuthorizationContext,
			input: { scope: Scope; userId: string; roleId: string },
		) => owned(db, (tx) => mutate(tx, actor, input, "grant")),
		revokeRole: (
			db: AuthorizationDatabase,
			actor: AuthorizationContext,
			input: { scope: Scope; userId: string; roleId: string },
		) => owned(db, (tx) => mutate(tx, actor, input, "revoke")),
		listAssignmentsInTransaction,
		listAssignments: (
			db: AuthorizationDatabase,
			actor: AuthorizationContext,
			scope: Scope,
			input: { limit?: number; cursor?: string } = {},
		) =>
			owned(db, (tx) => listAssignmentsInTransaction(tx, actor, scope, input)),
	});
}
