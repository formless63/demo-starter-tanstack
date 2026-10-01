import assert from "node:assert/strict";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const cta = JSON.parse(await readFile(".cta.json", "utf8"));
assert.equal(cta.projectName, "cache-addon-clean-install");
assert.ok(resolve(process.cwd()).includes("cache-coordination-addon-"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
delete pkg.dependencies.redis;
for (const script of Object.keys(pkg.scripts)) if (script.startsWith("cache:")) delete pkg.scripts[script];
await writeFile("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
await rm("src/integrations/cache", { recursive: true });
for (const script of await readdir("scripts")) if (script.startsWith("cache-")) await rm(resolve("scripts", script));
await rm("compose.cache.yaml");
for (const envPath of [".env.local", ".env.example"]) {
	try { await writeFile(envPath, (await readFile(envPath, "utf8")).split("\n").filter((line) => !/^CACHE_/.test(line)).join("\n")); }
	catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
assert.equal(spawnSync(process.execPath, ["install"], { stdio: "inherit" }).status, 0);
console.info("Cache runtime removed without contacting external infrastructure");
