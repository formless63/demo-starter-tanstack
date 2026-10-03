import { useQuery } from "@tanstack/react-query";
import { authClient } from "#/lib/auth-client";
export function useProductFlags() {
	const { data: session } = authClient.useSession();
	return useQuery({
		queryKey: [
			"product-flags",
			session?.user.id ?? null,
			session?.session.activeOrganizationId ?? null,
		],
		enabled: !!session?.user,
		staleTime: 0,
		gcTime: 0,
		queryFn: async ({ signal }) => {
			const response = await fetch("/api/flags", {
				signal,
				cache: "no-store",
				credentials: "same-origin",
			});
			if (!response.ok) return { "beta.dashboard": false };
			const body = (await response.json()) as Record<string, unknown>;
			return { "beta.dashboard": body["beta.dashboard"] === true };
		},
	});
}
