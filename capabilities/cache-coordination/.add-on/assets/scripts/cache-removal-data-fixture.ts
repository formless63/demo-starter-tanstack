import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCache } from "../src/integrations/cache/cache.server";

// Only a clean fixture may create this disposable backend and remove runtime files.
const cta = JSON.parse(await readFile(".cta.json", "utf8"));
assert.equal(cta.projectName, "cache-addon-clean-install");
assert.ok(resolve(process.cwd()).includes("cache-coordination-addon-"));
const image = (await readFile("compose.cache.yaml", "utf8")).match(/image:\s*(\S+)/)?.[1];
assert.ok(image);
function docker(args: string[]) {
	const result = spawnSync("docker", args, { encoding: "utf8" });
	assert.equal(result.status, 0, `Disposable Cache fixture failed: ${args[0]}`);
	return result.stdout.trim();
}
const container = docker(["run", "--detach", "--rm", "--pull=never", "--tmpfs", "/data",
	"--publish", "127.0.0.1::6379", image, "valkey-server", "--save", "", "--appendonly", "no"]);
let cache: ReturnType<typeof createCache> | undefined;
try {
	const port = docker(["port", container, "6379/tcp"]).split(":").at(-1);
	const url = `redis://127.0.0.1:${port}`;
	cache = createCache({ env: { CACHE_URL: url, CACHE_KEY_PREFIX: `removal:${randomUUID()}` } });
	// The compatibility suite already covers reconnect; readiness has a bounded wait here.
	const deadline = Date.now() + 10_000;
	while (true) {
		try { await cache.checkCache(); break; }
		catch (error) {
			if (Date.now() >= deadline) throw error;
			await new Promise(resolve => setTimeout(resolve, 100));
		}
	}
	await cache.setWithoutExpiry("retained", "application-owned-data");
	const removal = spawnSync(process.execPath, ["scripts/cache-removal-fixture.ts"], {
		env: { ...process.env, CACHE_URL: url }, stdio: "inherit",
	});
	assert.equal(removal.status, 0);
	assert.equal(await cache.get("retained"), "application-owned-data");
	console.info("Cache application removal retained the backend and its existing data");
} finally {
	await cache?.close();
	docker(["rm", "--force", container]);
}
