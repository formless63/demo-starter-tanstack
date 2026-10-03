// Browser-only state helpers. No auth, persistence, or backend imports.
export function uniqueOrganizationRows<T extends { id: string }>(
	rows: T[],
): T[] {
	const unique = new Map<string, T>();
	for (const row of rows) unique.set(row.id, row);
	return [...unique.values()];
}

export function pendingOrganizationInvitations<
	T extends { id: string; status: string; createdAt: Date | string },
>(rows: T[]): T[] {
	return uniqueOrganizationRows(rows)
		.filter((row) => row.status === "pending")
		.sort((a, b) => {
			const timestamp = (date: Date | string) => {
				const value = new Date(date).getTime();
				return Number.isFinite(value) ? value : 0;
			};
			return (
				timestamp(b.createdAt) - timestamp(a.createdAt) ||
				(a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
			);
		});
}

export type OrganizationDraft = {
	name: string;
	slug: string;
	dirty: boolean;
};

export function reconcileOrganizationDraft(
	draft: OrganizationDraft,
	organization: { name: string; slug: string },
): OrganizationDraft {
	return draft.dirty ? draft : { ...organization, dirty: false };
}

export async function currentOrganizationRequest<T>(
	signal: AbortSignal,
	request: () => Promise<T>,
): Promise<T> {
	signal.throwIfAborted();
	const result = await request();
	signal.throwIfAborted();
	return result;
}

export async function copyOrganizationInvitation(
	link: string,
	writeText?: (text: string) => Promise<void>,
): Promise<"copied" | "manual"> {
	try {
		if (!writeText) return "manual";
		await writeText(link);
		return "copied";
	} catch {
		return "manual";
	}
}
