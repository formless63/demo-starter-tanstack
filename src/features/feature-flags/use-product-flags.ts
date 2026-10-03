import { useQuery } from "@tanstack/react-query";
import { authClient } from "#/lib/auth-client";
import { loadProductFlags } from "./product-flags";
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
		retry: false,
		queryFn: ({ signal }) => loadProductFlags(signal),
	});
}
