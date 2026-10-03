import { createServerFn } from "@tanstack/react-start";
// Inputs are validated inside server code so framework validation never exposes
// underlying issue values. No browser user/role claim is trusted.
export const listOrganizations = createServerFn({ method: "POST" })
	.validator((data: { cursor?: string }) => data)
	.handler(async ({ data }) =>
		(await import("./organizations.server")).ownOrganizations(data),
	);
export const getOrganizationSummary = createServerFn({ method: "POST" })
	.validator((data: { organizationId: string; cursor?: string }) => data)
	.handler(async ({ data }) =>
		(await import("./organizations.server")).organizationSummary(
			data?.organizationId,
			data?.cursor,
		),
	);
export const addOrganizationNote = createServerFn({ method: "POST" })
	.validator((data: { organizationId: string; title: string }) => data)
	.handler(async ({ data }) =>
		(await import("./organizations.server")).createNote(data),
	);
export const deleteOrganizationNote = createServerFn({ method: "POST" })
	.validator((data: { organizationId: string; id: string }) => data)
	.handler(async ({ data }) =>
		(await import("./organizations.server")).removeNote(data),
	);
export const getOrganizationNote = createServerFn({ method: "POST" })
	.validator((data: { organizationId: string; id: string }) => data)
	.handler(async ({ data }) =>
		(await import("./organizations.server")).getNote(data),
	);
export const updateOrganizationNote = createServerFn({ method: "POST" })
	.validator(
		(data: { organizationId: string; id: string; title: string }) => data,
	)
	.handler(async ({ data }) =>
		(await import("./organizations.server")).updateNote(data),
	);
