import assert from "node:assert/strict";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const cta = JSON.parse(await readFile(".cta.json", "utf8"));
assert.equal(cta.projectName, "webhooks-addon-clean-install");
assert.ok(resolve(process.cwd()).includes("webhooks-addon-"));
await rm("src/integrations/webhooks", { recursive: true });
await rm("src/lib/webhooks.server.ts");
const registry = await readFile("src/integrations/jobs/registry.ts", "utf8");
await writeFile(
	"src/integrations/jobs/registry.ts",
	registry
		.replace(/^import \{ referenceWebhookJobs \}.*\n/m, "")
		.replace(/^\s*\.\.\.referenceWebhookJobs,\n/m, ""),
);
for (const file of await readdir("scripts"))
	if (file.startsWith("webhooks-")) await rm(resolve("scripts", file));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
for (const key of Object.keys(pkg.scripts))
	if (key.startsWith("webhooks:")) delete pkg.scripts[key];
await writeFile("package.json", JSON.stringify(pkg, null, 2) + "\n");
for (const file of [".env.local", ".env.example"]) {
	try {
		const env = await readFile(file, "utf8");
		await writeFile(
			file,
			env
				.split("\n")
				.filter((line) => !line.startsWith("WEBHOOK_"))
				.join("\n"),
		);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}
assert.ok(pkg.dependencies["pg-boss"]);
assert.ok(
	(await readFile("src/integrations/jobs/registry.ts", "utf8")).includes(
		"starter.echo",
	),
);
console.info(
	"Webhooks removed, Jobs retained; no queue history or remote endpoints changed",
);
