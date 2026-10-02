import { createHmac, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { fromCrossJSON, toJSON } from "seroval";

// Exercise the real session-bound native function in development and the built
// Node/container application. Fixture sessions use only the test database/secret.
test("authenticated native Search preserves ownership and safe errors", async ({
	request,
	baseURL,
}) => {
	const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
	const owner = `search-e2e-${randomUUID()}`;
	const other = `search-e2e-${randomUUID()}`;
	const sessionToken = randomUUID();
	const marker = `opaque${randomUUID().replaceAll("-", "")}`;
	try {
		await pool.query(
			"INSERT INTO \"user\" (id,name,email) VALUES ($1,$1,$1 || '@example.test'),($2,$2,$2 || '@example.test')",
			[owner, other],
		);
		await pool.query(
			"INSERT INTO session (id,token,user_id,expires_at) VALUES ($1,$2,$3,now() + interval '1 hour')",
			[randomUUID(), sessionToken, owner],
		);
		await pool.query(
			"INSERT INTO project (id,owner_id,name,description) VALUES ($1,$2,$3,NULL),($4,$2,'Elsewhere',$3),($5,$6,$3,'private')",
			[
				`${owner}-title`,
				owner,
				marker,
				`${owner}-body`,
				`${other}-private`,
				other,
			],
		);
		let id: string | undefined;
		if (process.env.E2E_BASE_URL) {
			for (const file of await readdir(".output/server/_ssr")) {
				if (!file.startsWith("projects.functions-")) continue;
				const source = await readFile(`.output/server/_ssr/${file}`, "utf8");
				id = /id: "([^"]+)",\s*name: "searchProjects"/.exec(source)?.[1];
				if (id) break;
			}
		} else {
			const module = await request.get(
				"/src/features/projects/projects.functions.ts",
			);
			const source = await module.text();
			const search = source.slice(
				source.indexOf("export const searchProjects"),
			);
			id = /createClientRpc\("([^"]+)"/.exec(search)?.[1];
		}
		expect(
			id,
			"Search must be present in the native function bundle",
		).toBeTruthy();
		const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
			.update(sessionToken)
			.digest("base64");
		const cookie = `${process.env.E2E_BASE_URL ? "__Secure-" : ""}better-auth.session_token=${encodeURIComponent(`${sessionToken}.${signature}`)}`;
		const call = (data: unknown, authenticated = true) =>
			request.post(`/_serverFn/${id}`, {
				headers: {
					"Content-Type": "application/json",
					"x-tsr-serverFn": "true",
					Origin: baseURL!,
					Cookie: authenticated ? cookie : "",
				},
				data: JSON.stringify(toJSON({ data, context: {} })),
			});
		const first = await call({ query: marker, limit: 1 });
		const wire = await first.json();
		const envelope = fromCrossJSON(wire, { refs: new Map() }) as {
			result: {
				results: { row: { id: string }; rank: number }[];
				nextCursor: string | null;
			};
		};
		const page = envelope.result;
		expect(page.results).toHaveLength(1);
		expect(page.results[0].row.id).toBe(`${owner}-title`);
		expect(JSON.stringify(page)).not.toMatch(/searchVector|rankText|private/);
		expect(page.nextCursor).toBeTruthy();
		const second = await call({ query: marker, cursor: page.nextCursor });
		const next = (
			fromCrossJSON(await second.json(), { refs: new Map() }) as typeof envelope
		).result;
		expect(next.results.map((r: { row: { id: string } }) => r.row.id)).toEqual([
			`${owner}-body`,
		]);
		expect(next.nextCursor).toBeNull();
		for (const data of [
			{ query: marker, cursor: "bad=" },
			{ query: marker, ownerId: other },
			{ query: "\ud800" },
		]) {
			const response = await call(data);
			const body = await response.text();
			expect(body).toContain("Invalid search request");
			expect(body).not.toContain(marker);
			expect(body).not.toMatch(/postgresql|SELECT |password|search_vector/);
		}
		const anonymous = await call({ query: marker }, false);
		expect(await anonymous.text()).not.toContain(`${owner}-title`);
	} finally {
		await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [
			[owner, other],
		]);
		await pool.end();
	}
});
