import assert from "node:assert/strict";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Fixture only: fail closed outside the harness-owned clean disposable scaffold.
const cta = JSON.parse(await readFile(".cta.json", "utf8"));
assert.equal(cta.projectName, "storage-addon-clean-install");
assert.ok(resolve(process.cwd()).includes("object-storage-addon-"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
delete pkg.dependencies["@aws-sdk/client-s3"];
delete pkg.dependencies["@aws-sdk/s3-request-presigner"];
for (const script of Object.keys(pkg.scripts))
	if (script.startsWith("storage:")) delete pkg.scripts[script];
await writeFile("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
await rm("src/integrations/storage", { recursive: true });
for (const script of await readdir("scripts"))
	if (script.startsWith("storage-")) await rm(resolve("scripts", script));
await rm("compose.storage.yaml");
await rm("infrastructure/storage", { recursive: true });
for (const envPath of [".env.local", ".env.example"]) {
	try {
		const env = await readFile(envPath, "utf8");
		await writeFile(
			envPath,
			env
				.split("\n")
				.filter((line) => !/^STORAGE_/.test(line))
				.join("\n"),
		);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}
const result = spawnSync(process.execPath, ["install"], { stdio: "inherit" });
assert.equal(result.status, 0);
console.info(
	"Application removal applied without contacting storage or deleting remote data",
);
