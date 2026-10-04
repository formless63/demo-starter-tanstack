import { describe, expect, it } from "vitest";
import {
	copyOrganizationInvitation,
	currentOrganizationRequest,
	pendingOrganizationInvitations,
	reconcileOrganizationDraft,
	uniqueOrganizationRows,
} from "./organization-ui";

describe("organization browser state helpers", () => {
	it("deduplicates overlapping pages and retains the latest row without changing order", () => {
		expect(
			uniqueOrganizationRows([
				{ id: "a", role: "member" },
				{ id: "b", role: "member" },
				{ id: "a", role: "admin" },
			]),
		).toEqual([
			{ id: "a", role: "admin" },
			{ id: "b", role: "member" },
		]);
	});

	it("filters historical invitations before pagination and orders pending Date/string rows newest first", () => {
		const rows = Array.from({ length: 30 }, (_, index) => ({
			id: `old-${index}`,
			status: "accepted",
			createdAt: "2026-01-01T00:00:00.000Z",
		}));
		const result = pendingOrganizationInvitations([
			...rows,
			{ id: "a", status: "pending", createdAt: "2026-02-01T00:00:00.000Z" },
			{
				id: "b",
				status: "pending",
				createdAt: new Date("2026-02-01T00:00:00.000Z"),
			},
			{ id: "c", status: "pending", createdAt: "2026-03-01T00:00:00.000Z" },
		]);
		expect(result.slice(0, 25).map((row) => row.id)).toEqual(["c", "b", "a"]);
		expect(rows).toHaveLength(30);
	});

	it("keeps every pending invitation accessible across visible pages and deduplicates terminal updates", () => {
		const rows = Array.from({ length: 61 }, (_, index) => ({
			id: `invite-${String(index).padStart(2, "0")}`,
			status: "pending",
			createdAt: "2026-01-01T00:00:00.000Z",
		}));
		const result = pendingOrganizationInvitations([
			...rows,
			{ ...rows[0], status: "cancelled" },
		]);
		expect(result).toHaveLength(60);
		expect(
			new Set(
				result
					.slice(0, 25)
					.concat(result.slice(25, 50), result.slice(50))
					.map((row) => row.id),
			).size,
		).toBe(60);
		expect(result.some((row) => row.id === "invite-00")).toBe(false);
	});

	it("hydrates pristine details but never replaces edits with a late summary", () => {
		const stale = { name: "Old name", slug: "old-slug" };
		const edited = { name: "My edit", slug: "my-slug", dirty: true };
		expect(reconcileOrganizationDraft(edited, stale)).toBe(edited);
		expect(
			reconcileOrganizationDraft({ name: "", slug: "", dirty: false }, stale),
		).toEqual({ ...stale, dirty: false });
	});

	it("does not start a request for an aborted identity or selection", async () => {
		const controller = new AbortController();
		controller.abort();
		let started = false;
		await expect(
			currentOrganizationRequest(controller.signal, async () => {
				started = true;
				return "old";
			}),
		).rejects.toBe(controller.signal.reason);
		expect(started).toBe(false);
	});

	it("discards a late old-scope result even when the request ignores cancellation", async () => {
		const controller = new AbortController();
		let resolve!: (value: string) => void;
		const request = currentOrganizationRequest(
			controller.signal,
			() =>
				new Promise<string>((done) => {
					resolve = done;
				}),
		);
		controller.abort();
		resolve("old organization");
		await expect(request).rejects.toBe(controller.signal.reason);
		expect(
			await currentOrganizationRequest(
				new AbortController().signal,
				async () => "new organization",
			),
		).toBe("new organization");
	});

	it("returns a manual-copy outcome when clipboard access is absent or rejected", async () => {
		expect(
			await copyOrganizationInvitation("https://example.test/invite"),
		).toBe("manual");
		expect(
			await copyOrganizationInvitation(
				"https://example.test/invite",
				async () => {
					throw new Error("Clipboard denied");
				},
			),
		).toBe("manual");
	});

	it("reports successful copying only after the exact link is written", async () => {
		let copied = "";
		const link = "https://example.test/app/organizations?invitation=opaque";
		expect(
			await copyOrganizationInvitation(link, async (value) => {
				copied = value;
			}),
		).toBe("copied");
		expect(copied).toBe(link);
	});
});
