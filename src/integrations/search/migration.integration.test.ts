import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { expect, it } from "vitest";

it("migrates clean and existing Projects while retaining applied history and records", async () => {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("Disposable PostgreSQL admin URL required");
	const admin = new pg.Pool({ connectionString: url });
	const name = `search_${randomUUID().replaceAll("-", "")}`;
	const target = new URL(url);
	target.pathname = `/${name}`;
	const pool = new pg.Pool({ connectionString: target.toString() });
	const folder = await mkdtemp(join(tmpdir(), "search-migration-"));
	try {
		await admin.query(`CREATE DATABASE "${name}"`);
		await cp("drizzle", folder, { recursive: true });
		const journal = JSON.parse(
			await readFile(join(folder, "meta/_journal.json"), "utf8"),
		);
		journal.entries = journal.entries.filter(
			(entry: { idx: number }) => entry.idx < 4,
		);
		const { writeFile } = await import("node:fs/promises");
		await writeFile(
			join(folder, "meta/_journal.json"),
			JSON.stringify(journal),
		);
		await migrate(drizzle(pool), { migrationsFolder: folder });
		await pool.query(
			`INSERT INTO "user" (id, name, email) VALUES ('before', 'Before', 'before@example.test'); INSERT INTO project (id, owner_id, name, description) VALUES ('before', 'before', 'Existing nebula', NULL)`,
		);
		const history = await pool.query(
			"SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id",
		);
		await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
		const after = await pool.query(
			"SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id",
		);
		expect(after.rows.slice(0, history.rows.length)).toEqual(history.rows);
		const currentJournal = JSON.parse(
			await readFile("drizzle/meta/_journal.json", "utf8"),
		);
		expect(after.rows).toHaveLength(currentJournal.entries.length);
		expect(
			(
				await pool.query(
					"SELECT id FROM project WHERE search_vector @@ websearch_to_tsquery('simple', 'nebula')",
				)
			).rows,
		).toEqual([{ id: "before" }]);
		await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
		expect(
			(
				await pool.query(
					"SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id",
				)
			).rows,
		).toEqual(after.rows);
		await pool.query(
			"DROP SCHEMA public CASCADE; DROP SCHEMA drizzle CASCADE; CREATE SCHEMA public",
		);
		await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
		expect(
			(
				await pool.query(
					"SELECT attgenerated FROM pg_attribute WHERE attrelid = 'project'::regclass AND attname = 'search_vector'",
				)
			).rows[0].attgenerated,
		).toBe("s");
		expect(
			(
				await pool.query(
					"SELECT indexdef FROM pg_indexes WHERE indexname = 'project_search_vector_idx'",
				)
			).rows[0].indexdef,
		).toContain("USING gin (search_vector)");
	} finally {
		await pool.end();
		await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
		await admin.end();
		await rm(folder, { recursive: true, force: true });
	}
}, 30000);
