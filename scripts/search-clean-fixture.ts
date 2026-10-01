import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Fixture-only SQL, never a shipped application search schema or migration.
const cta = JSON.parse(await readFile(".cta.json", "utf8"));
assert.equal(cta.projectName, "search-addon-clean-install");
assert.ok(resolve(process.cwd()).includes("search-addon-"));
assert.ok(
	process.env.DATABASE_URL,
	"Disposable PostgreSQL 18 admin URL required",
);
const phase = process.argv[2] ?? "prepare";
assert.ok(["prepare", "verify", "cleanup"].includes(phase));
const stateFile = ".search-fixture-state.json";
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
if (phase === "cleanup") {
	try {
		if (existsSync(stateFile)) {
			const state = JSON.parse(await readFile(stateFile, "utf8"));
			assert.match(state.name, /^search_addon_[a-f0-9]{32}$/);
			await admin.query(`DROP DATABASE IF EXISTS "${state.name}" WITH (FORCE)`);
			await rm(stateFile);
		}
	} finally {
		await admin.end();
	}
	process.exit(0);
}
const state =
	phase === "verify"
		? JSON.parse(await readFile(stateFile, "utf8"))
		: undefined;
const name = state?.name ?? `search_addon_${randomUUID().replaceAll("-", "")}`;
assert.match(name, /^search_addon_[a-f0-9]{32}$/);
const url = new URL(process.env.DATABASE_URL);
url.pathname = `/${name}`;
const pool = new pg.Pool({ connectionString: url.toString() });
function run(args: string[]) {
	const result = spawnSync(process.execPath, args, {
		stdio: "inherit",
		env: { ...process.env, DATABASE_URL: url.toString() },
	});
	assert.equal(result.status, 0, `Fixture command failed: ${args.join(" ")}`);
}
try {
	if (phase === "prepare") {
		assert.equal(
			existsSync("drizzle"),
			false,
			"Search add-on must not install production migrations",
		);
		await admin.query(`CREATE DATABASE "${name}"`);
		await writeFile(stateFile, JSON.stringify({ name }));
		await mkdir("drizzle/meta", { recursive: true });
		const migration = `CREATE TABLE fixture_domain (id text PRIMARY KEY, name text NOT NULL, description text, search_vector tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(name, '')), 'A') || setweight(to_tsvector('simple', coalesce(description, '')), 'B')) STORED);\n--> statement-breakpoint\nCREATE INDEX fixture_domain_search_idx ON fixture_domain USING gin (search_vector);\n`;
		await writeFile("drizzle/0000_search_fixture.sql", migration);
		await writeFile(
			"drizzle/meta/_journal.json",
			JSON.stringify({
				version: "7",
				dialect: "postgresql",
				entries: [
					{
						idx: 0,
						version: "7",
						when: 1,
						tag: "0000_search_fixture",
						breakpoints: true,
					},
				],
			}),
		);
		await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
		await pool.query(
			"INSERT INTO fixture_domain(id, name) VALUES ('retained', 'fixture record')",
		);
		const history = await pool.query(
			"SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id",
		);
		run(["run", "search:smoke"]);
		// Check owned assets independently of the official scaffold's environment-only
		// drizzle.config.ts typing. The full scaffold is verified by both builds.
		await writeFile(
			"tsconfig.search-fixture.json",
			JSON.stringify({
				extends: "./tsconfig.json",
				include: ["src/integrations/search/**/*.ts", "scripts/search-smoke.ts"],
			}),
		);
		run(["x", "tsc", "--noEmit", "--project", "tsconfig.search-fixture.json"]);
		await rm("tsconfig.search-fixture.json");
		run(["run", "build"]);
		await rm("src/integrations/search/search.server.ts");
		await rm("src/integrations/search/validation.ts");
		await rm("scripts/search-smoke.ts");
		const pkg = JSON.parse(await readFile("package.json", "utf8"));
		delete pkg.scripts["search:smoke"];
		await writeFile("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
		await writeFile(
			stateFile,
			JSON.stringify({ name, migration, history: history.rows }),
		);
	} else {
		// This phase runs only after the generic final post-removal rebuild.
		// Retain the schema-only helper and domain migration/rows. No dependency pruning:
		// PostgreSQL/Drizzle are baseline and Search added no runtime package.
		assert.ok(await readFile("src/integrations/search/schema.ts", "utf8"));
		assert.equal(
			await readFile("drizzle/0000_search_fixture.sql", "utf8"),
			state.migration,
		);
		await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
		assert.deepEqual(
			(
				await pool.query(
					"SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id",
				)
			).rows,
			state.history,
		);
		assert.deepEqual((await pool.query("SELECT id FROM fixture_domain")).rows, [
			{ id: "retained" },
		]);
		assert.equal(
			(
				await pool.query(
					"SELECT attgenerated FROM pg_attribute WHERE attrelid = 'fixture_domain'::regclass AND attname = 'search_vector'",
				)
			).rows[0].attgenerated,
			"s",
		);
		assert.match(
			(
				await pool.query(
					"SELECT pg_get_indexdef('fixture_domain_search_idx'::regclass) AS definition",
				)
			).rows[0].definition,
			/USING gin \(search_vector\)/,
		);
		assert.deepEqual(
			(
				await pool.query(
					"SELECT name, search_vector::text AS vector FROM fixture_domain WHERE id = 'retained'",
				)
			).rows,
			[{ name: "fixture record", vector: "'fixture':1A 'record':2A" }],
		);
		console.info(
			"Search clean install/removal retained domain records, generated schema and applied migration history",
		);
	}
} finally {
	await pool.end();
	await admin.end();
}
