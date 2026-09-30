import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Fixture-only lifecycle; never run these removals in an application checkout.
const cta = JSON.parse(await readFile(".cta.json", "utf8"));
assert.equal(cta.projectName, "audit-log-addon-clean-install");
assert.ok(resolve(process.cwd()).includes("audit-log-addon-"));
assert.ok(process.env.DATABASE_URL, "A disposable PostgreSQL admin URL is required");
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const name = `audit_addon_${randomUUID().replaceAll("-", "")}`;
const url = new URL(process.env.DATABASE_URL); url.pathname = `/${name}`;
const pool = new pg.Pool({ connectionString: url.toString() });
function run(args: string[]) {
	const result = spawnSync(process.execPath, args, { stdio: "inherit", env: { ...process.env, DATABASE_URL: url.toString() } });
	assert.equal(result.status, 0, `Fixture command failed: ${args.join(" ")}`);
}
try {
	await admin.query(`CREATE DATABASE "${name}"`);
	await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
	const indexes = await pool.query("SELECT indexname FROM pg_indexes WHERE tablename = 'audit_event'");
	assert.equal(indexes.rowCount, 5);
	run(["run", "audit-log:smoke"]);
	run(["run", "build"]);
	const before = await pool.query("SELECT count(*)::int AS count FROM audit_event");
	assert.ok(before.rows[0].count > 0);
	await rm("src/integrations/audit-log/audit.server.ts");
	await rm("src/integrations/audit-log/validation.ts");
	// Retain schema and committed migrations: application removal is non-destructive.
	const after = await pool.query("SELECT count(*)::int AS count FROM audit_event");
	assert.equal(after.rows[0].count, before.rows[0].count);
	assert.ok(await readFile("drizzle/0000_audit_log.sql", "utf8"));
	assert.ok(await readFile("src/integrations/audit-log/schema.ts", "utf8"));
	await rm("scripts/audit-log-smoke.ts");
	const pkg = JSON.parse(await readFile("package.json", "utf8"));
	delete pkg.scripts["audit-log:smoke"];
	await writeFile("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
	console.info("Clean installation and application removal retained audit history, schema and migrations");
} finally {
	await pool.end();
	await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
	await admin.end();
}
