import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { projects, user } from "#/db/schema";
import { searchProjectsForOwner } from "./projects.server";

const owner = `search-owner-${crypto.randomUUID()}`;
const other = `search-other-${crypto.randomUUID()}`;
describe("Projects Search reference authorization", () => {
	beforeAll(async () => {
		await db.insert(user).values(
			[owner, other].map((id) => ({
				id,
				name: "Search fixture",
				email: `${id}@example.test`,
			})),
		);
		await db.insert(projects).values([
			{
				id: `${owner}-name`,
				ownerId: owner,
				name: "nebula",
				description: null,
			},
			{
				id: `${owner}-description`,
				ownerId: owner,
				name: "Elsewhere",
				description: "nebula",
			},
			{
				id: `${other}-private`,
				ownerId: other,
				name: "nebula",
				description: "private",
			},
		]);
	});
	afterAll(async () => {
		await db.delete(user).where(eq(user.id, owner));
		await db.delete(user).where(eq(user.id, other));
	});
	it("enforces ownership and excludes FTS internals", async () => {
		const page = await searchProjectsForOwner(owner, {
			query: "nebula",
			limit: 1,
		});
		expect(page.results[0].row.id).toBe(`${owner}-name`);
		expect(page.results[0].row).not.toHaveProperty("searchVector");
		expect(page.results[0]).not.toHaveProperty("rankText");
		expect(page.nextCursor).toBeTypeOf("string");
		const next = await searchProjectsForOwner(owner, {
			query: "nebula",
			limit: 1,
			cursor: page.nextCursor ?? undefined,
		});
		expect(next.results.map((r) => r.row.id)).toEqual([`${owner}-description`]);
		expect(next.results[0].rank).toBeLessThan(page.results[0].rank);
		expect(next.nextCursor).toBeNull();
		// A cursor from a different owner never grants access.
		expect(
			(
				await searchProjectsForOwner(other, {
					query: "nebula",
					cursor: page.nextCursor ?? undefined,
				})
			).results.every((r) => r.row.ownerId === other),
		).toBe(true);
	});
	it("has a stored generated column and GIN index", async () => {
		const generated = await db.execute(
			sql`SELECT attgenerated FROM pg_attribute WHERE attrelid = 'project'::regclass AND attname = 'search_vector'`,
		);
		expect(generated.rows[0].attgenerated).toBe("s");
		const index = await db.execute(
			sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'project_search_vector_idx'`,
		);
		expect(index.rows[0].indexdef).toContain("USING gin (search_vector)");
	});
	it("maps database failures to safe errors and emits no raw query logs", async () => {
		const marker = "rawPrivateSearch";
		const spies = [
			vi.spyOn(console, "error"),
			vi.spyOn(console, "warn"),
			vi.spyOn(console, "info"),
			vi.spyOn(console, "log"),
			vi.spyOn(console, "debug"),
		];
		const select = vi.spyOn(db, "select").mockImplementationOnce(() => {
			throw new Error(`PostgreSQL SQL ${marker}`);
		});
		try {
			await expect(
				searchProjectsForOwner(owner, { query: marker }),
			).rejects.toMatchObject({
				code: "unavailable",
				message: "Search unavailable",
			});
			expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
			await expect(
				searchProjectsForOwner(owner, { query: " " }),
			).rejects.toMatchObject({
				code: "invalid-query",
				message: "Invalid search request",
			});
		} finally {
			select.mockRestore();
			for (const spy of spies) spy.mockRestore();
		}
	});
});
