import type { OrganizationReader } from "./organizations.server";
import { resolveTenantContext } from "./organizations.server";
import { OrganizationError, opaqueId, organizationRole } from "./validation";

interface NativeMemberApi {
	getSession(input: {
		headers: Headers;
	}): Promise<{ user: { id: string } } | null>;
	addMember(input: {
		headers: Headers;
		body: { organizationId: string; userId: string; role: "admin" | "member" };
	}): Promise<unknown>;
}
// Named trusted helper, never a generic endpoint proxy. Native dispatch/hook checks
// execute again. Native pathless owner bootstrap remains forbidden.
export async function addOrganizationMember(
	api: NativeMemberApi,
	verifiedActor: { id: string },
	headers: Headers,
	input: { organizationId: string; userId: string; role?: "admin" | "member" },
	dbOrTx: OrganizationReader,
) {
	const session = await api.getSession({ headers });
	if (!session?.user) throw new OrganizationError("unauthenticated");
	if (session.user.id !== opaqueId(verifiedActor.id))
		throw new OrganizationError("forbidden");
	const context = await resolveTenantContext(
		verifiedActor,
		input.organizationId,
		dbOrTx,
	);
	const role = organizationRole(input.role ?? "member");
	if (
		role === "owner" ||
		context.role === "member" ||
		(context.role === "admin" && role !== "member")
	)
		throw new OrganizationError("forbidden");
	return api.addMember({
		headers,
		body: {
			organizationId: context.scope.id,
			userId: opaqueId(input.userId),
			role,
		},
	});
}
