import { z } from "zod";

export const projectPermissionSchema = z.enum(["read", "write"]);
export const apiPermissionsSchema = z.object({
	projects: z.array(projectPermissionSchema).default([]),
});

export type ApiPermissions = z.infer<typeof apiPermissionsSchema>;
export type ApiPermissionRequirement = {
	[K in keyof ApiPermissions]?: ApiPermissions[K];
};

export const PROJECT_PERMISSION_OPTIONS = [
	{ value: "read", label: "Read projects" },
	{ value: "write", label: "Create and change projects" },
] as const;

export function hasRequiredPermissions(
	actual: ApiPermissions,
	required: ApiPermissionRequirement,
) {
	return Object.entries(required).every(([resource, actions]) => {
		const granted = actual[resource as keyof ApiPermissions] ?? [];
		return actions?.every((action) => granted.includes(action)) ?? true;
	});
}
