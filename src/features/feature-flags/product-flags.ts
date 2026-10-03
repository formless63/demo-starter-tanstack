export type ProductFlags = Readonly<{ "beta.dashboard": boolean }>;

function disabledFlags(): ProductFlags {
	return { "beta.dashboard": false };
}

/** Fixed browser projection only; these values never authorize an operation. */
export async function loadProductFlags(
	signal: AbortSignal,
	fetcher: typeof fetch = fetch,
): Promise<ProductFlags> {
	try {
		signal.throwIfAborted();
		const response = await fetcher("/api/flags", {
			signal,
			cache: "no-store",
			credentials: "same-origin",
		});
		signal.throwIfAborted();
		if (!response.ok) return disabledFlags();
		const body: unknown = await response.json();
		signal.throwIfAborted();
		if (!body || typeof body !== "object" || Array.isArray(body))
			return disabledFlags();
		return {
			"beta.dashboard":
				(body as Record<string, unknown>)["beta.dashboard"] === true,
		};
	} catch (error) {
		// Cancellation belongs to the query/identity lifecycle, not a new value.
		signal.throwIfAborted();
		if (error instanceof Error && error.name === "AbortError") throw error;
		return disabledFlags();
	}
}

/** A failed refetch must not render a previously cached true value. */
export function isBetaDashboardEnabled(query: {
	data?: ProductFlags;
	isError: boolean;
	fetchStatus: "idle" | "fetching" | "paused";
}): boolean {
	return (
		!query.isError &&
		query.fetchStatus !== "paused" &&
		query.data?.["beta.dashboard"] === true
	);
}
