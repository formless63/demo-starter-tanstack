import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const cta = JSON.parse(await readFile(".cta.json", "utf8"));
assert.equal(cta.projectName, "ai-addon-clean-install");
assert.ok(resolve(process.cwd()).includes("ai-addon-"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
delete pkg.dependencies.openai;
// Zod is application-owned/shared; retain it rather than guessing other call sites.
for (const script of Object.keys(pkg.scripts)) if (script.startsWith("ai:")) delete pkg.scripts[script];
await writeFile("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
await rm("src/integrations/ai", { recursive: true });
for (const script of await readdir("scripts")) if (script.startsWith("ai-")) await rm(resolve("scripts", script));
for (const path of [".env.local", ".env.example"]) {
 try { const env = await readFile(path, "utf8"); await writeFile(path, env.split("\n").filter(line => !/^AI_/.test(line)).join("\n")); }
 catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
assert.equal(spawnSync(process.execPath, ["install"], { stdio: "inherit" }).status, 0);
console.info("AI application removal passed; authoring guidance retained; no database or external account/credential mutation");
