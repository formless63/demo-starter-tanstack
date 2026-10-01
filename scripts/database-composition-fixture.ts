import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";
const cta = JSON.parse(await readFile(".cta.json", "utf8"));
assert.equal(cta.projectName, "database-composition-clean-install");
assert.ok(resolve(".").includes("addon-"));
assert.ok(process.env.DATABASE_URL);
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const name = `composition_${randomUUID().replaceAll("-", "")}`;
const url = new URL(process.env.DATABASE_URL);
url.pathname = `/${name}`;
const env = {
	...process.env,
	DATABASE_URL: url.toString(),
	PGBOSS_DATABASE_URL: url.toString(),
	PGBOSS_SCHEMA: "composition_jobs",
};
function run(args: string[]) {
	assert.equal(
		spawnSync(process.execPath, args, { env, stdio: "inherit" }).status,
		0,
	);
}
try {
	await admin.query(`CREATE DATABASE "${name}"`);
	const journal = JSON.parse(
		await readFile("drizzle/meta/_journal.json", "utf8"),
	);
	assert.equal(journal.entries.length, 6);
	run(["run", "db:migrate"]);
	run(["run", "api-platform:smoke"]);
	run(["run", "audit-log:smoke"]);
	run(["run", "search:smoke"]);
	run(["run", "jobs:migrate"]);
	run(["run", "jobs:doctor"]);
	run(["run", "jobs:smoke"]);
	run(["run", "notifications:smoke"]);
	const pool = new pg.Pool({ connectionString: url.toString() });
	try {
		const result = await pool.query(
			"SELECT tablename FROM pg_tables WHERE schemaname='public'",
		);
		for (const table of ["user", "project", "apikey", "audit_event", "notification"])
			assert.ok(result.rows.some((row) => row.tablename === table));
		const vector = await pool.query(
			"SELECT attgenerated FROM pg_attribute WHERE attrelid = 'project'::regclass AND attname = 'search_vector'",
		);
		assert.equal(vector.rows[0].attgenerated, "s");
		const index = await pool.query(
			"SELECT indexdef FROM pg_indexes WHERE indexname = 'project_search_vector_idx'",
		);
		assert.ok(index.rows[0].indexdef.includes("USING gin (search_vector)"));
	} finally {
		await pool.end();
	}
	console.info(
		"Reviewed API + Audit + Jobs + Search + Notifications composition preserved all schemas and migration history",
	);
} finally {
	await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
	await admin.end();
}
