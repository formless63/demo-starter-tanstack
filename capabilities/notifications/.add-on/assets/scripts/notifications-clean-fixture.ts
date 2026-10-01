import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
const cta = JSON.parse(await readFile(".cta.json", "utf8")); assert.equal(cta.projectName, "notifications-addon-clean-install"); assert.ok(resolve(process.cwd()).includes("notifications-addon-"));
assert.ok(process.env.DATABASE_URL); const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const name = `notification_addon_${randomUUID().replaceAll("-", "")}`, url = new URL(process.env.DATABASE_URL); url.pathname = `/${name}`;
const pool = new pg.Pool({ connectionString: url.toString() });
const run = (args: string[]) => { const result = spawnSync(process.execPath, args, { stdio: "inherit", env: { ...process.env, DATABASE_URL: url.toString(), PGBOSS_DATABASE_URL: url.toString() } }); assert.equal(result.status,0, `Fixture command failed: ${args.join(" ")}`); };
try {
  await admin.query(`CREATE DATABASE "${name}"`); await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  assert.equal((await pool.query("SELECT indexname FROM pg_indexes WHERE tablename='notification'")).rowCount,4);
  run(["run", "jobs:migrate"]); run(["run", "notifications:unit"]); run(["run", "notifications:smoke"]); run(["run", "notifications:compat"]); run(["run", "build"]);
  const retainedId = randomUUID(); await pool.query("INSERT INTO notification(id,recipient_id,type,title,body,created_at) VALUES ($1,'fixture','fixture.retained','Retained','Keep data',now())",[retainedId]);
  // Producer stop + explicit cancellation must precede module removal. Fixture queue is otherwise empty.
  await pool.query("DELETE FROM pgboss.job WHERE name='notifications.deliver'");
  for (const file of ["jobs.server.ts","notifications.server.ts","ntfy.server.ts","transaction.server.ts"]) await rm(`src/integrations/notifications/${file}`);
  await rm("src/lib/notifications.server.ts");
  const registry = await readFile("src/integrations/jobs/registry.ts","utf8"); await writeFile("src/integrations/jobs/registry.ts",registry.split("\n").filter(line=>!line.includes("referenceNotificationJobs")).join("\n"));
  const pkg = JSON.parse(await readFile("package.json","utf8")); for (const key of Object.keys(pkg.scripts)) if (key.startsWith("notifications:")) delete pkg.scripts[key]; await writeFile("package.json",JSON.stringify(pkg,null,2)+"\n");
  for (const file of ["notifications-smoke.ts","notifications-unit.ts","notifications-compat.ts"]) await rm(`scripts/${file}`);
  assert.equal((await pool.query("SELECT id FROM notification WHERE id=$1",[retainedId])).rowCount,1);
  assert.ok(await readFile("drizzle/0000_notifications.sql","utf8")); assert.ok(await readFile("src/integrations/notifications/schema.ts","utf8"));
  run(["x","tsc","--noEmit"]); run(["run","jobs:doctor"]); run(["run","jobs:smoke"]); run(["run","build"]);
  console.info("Notifications clean migration/removal retained history, schema/migrations and Jobs; no remote ntfy account/topic deletion");
} finally { await pool.end(); await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await admin.end(); }
