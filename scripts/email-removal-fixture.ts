import assert from "node:assert/strict";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Fail closed: this performs removal only inside the generic clean scaffold.
const cta = JSON.parse(await readFile(".cta.json", "utf8"));
assert.equal(cta.projectName, "email-addon-clean-install");
assert.ok(resolve(process.cwd()).includes("email-addon-"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
delete pkg.dependencies.nodemailer; delete pkg.devDependencies["@types/nodemailer"];
for (const script of Object.keys(pkg.scripts)) if (script.startsWith("email:")) delete pkg.scripts[script];
await writeFile("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
await rm("src/integrations/email", { recursive: true });
for (const script of await readdir("scripts")) if (script.startsWith("email-")) await rm(resolve("scripts", script));
await rm("compose.email.yaml");
for (const path of [".env.local", ".env.example"]) {
	try { const env = await readFile(path, "utf8"); await writeFile(path, env.split("\n").filter(line => !/^(SMTP_|EMAIL_)/.test(line)).join("\n")); }
	catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
const result = spawnSync(process.execPath, ["install"], { stdio: "inherit" });
assert.equal(result.status, 0);
console.info("Email runtime removal applied; no database/provider/DNS/remote credentials touched");
