import { db } from "#/db";
import { defineFeatureFlags } from "#/integrations/feature-flags/feature-flags.server";
import {
	resolveTenantContext,
	setOrganizationTransactionBounds,
} from "#/integrations/organizations/organizations.server";
import { auth } from "#/lib/auth";

const flags = defineFeatureFlags();
const allowlist = ["beta.dashboard"] as const;
const headers = { "Cache-Control": "private, no-store" };
export async function flagProjection(request: Request) {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user)
			return Response.json(
				{
					code: "unauthenticated",
					message: "Authentication is required.",
					retryable: false,
				},
				{ status: 401, headers },
			);
		let tenantId: string | undefined;
		const selected = session.session.activeOrganizationId;
		if (selected) {
			const context = await db.transaction(async (tx) => {
				await setOrganizationTransactionBounds(tx);
				return resolveTenantContext(session.user, selected, tx);
			});
			tenantId = context.scope.id;
		}
		const result = await flags.evaluateMany(db, allowlist, {
			userId: session.user.id,
			tenantId,
		});
		return Response.json(
			Object.fromEntries(allowlist.map((key) => [key, result[key].value])),
			{ headers },
		);
	} catch {
		return Response.json(
			Object.fromEntries(allowlist.map((key) => [key, false])),
			{ headers },
		);
	}
}
