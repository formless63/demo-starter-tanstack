import { spawnSync } from "node:child_process";
import { storageConfig } from "../src/integrations/storage/config.server";
import { createStorage } from "../src/integrations/storage/storage.server";
import { storageError } from "../src/integrations/storage/errors.server";

export function docker(args: string[], environment: NodeJS.ProcessEnv = {}) {
	const sudo = process.env.STORAGE_DOCKER_SUDO === "true";
	const extra = Object.entries(environment)
		.filter((entry): entry is [string, string] => entry[1] !== undefined)
		.map(([key, value]) => `${key}=${value}`);
	const result = spawnSync(
		sudo ? "sudo" : "docker",
		sudo ? ["-n", "env", ...extra, "docker", ...args] : args,
		{ stdio: "inherit", env: { ...process.env, ...environment } },
	);
	if (result.status !== 0)
		throw new Error("Storage development container command failed");
}
export function providerEnvironment(
	provider: "rustfs" | "garage",
	port?: number,
): NodeJS.ProcessEnv {
	return {
		STORAGE_BUCKET: process.env.STORAGE_DEV_BUCKET || "starter-storage",
		STORAGE_ENDPOINT: `http://127.0.0.1:${port ?? (provider === "rustfs" ? process.env.RUSTFS_PORT || 9000 : process.env.GARAGE_PORT || 3900)}`,
		STORAGE_REGION: provider === "rustfs" ? "us-east-1" : "garage",
		STORAGE_ACCESS_KEY_ID:
			provider === "rustfs"
				? process.env.STORAGE_DEV_ACCESS_KEY || "starter-storage-dev"
				: process.env.GARAGE_DEV_ACCESS_KEY ||
					"GK0123456789abcdef0123456789abcdef",
		STORAGE_SECRET_ACCESS_KEY:
			process.env.STORAGE_DEV_SECRET_KEY ||
			"local-storage-only-not-for-production",
		STORAGE_SESSION_TOKEN: "",
		STORAGE_FORCE_PATH_STYLE: "true",
		STORAGE_KEY_PREFIX: "",
		STORAGE_PRESIGN_TTL_SECONDS: "600",
	};
}
export async function waitForStorage(environment: NodeJS.ProcessEnv) {
	const storage = createStorage(storageConfig(environment));
	try {
		for (let attempt = 0; attempt < 60; attempt++) {
			try {
				await storage.checkStorage();
				return;
			} catch (error) {
				// RustFS's explicitly configured development bucket may not exist yet.
				if (storageError(error).code === "not_found") return;
				if (attempt === 59) throw error;
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		}
	} finally {
		storage.close();
	}
}
export function runScript(path: string, environment: NodeJS.ProcessEnv) {
	const result = spawnSync(process.execPath, [path], {
		env: { ...process.env, ...environment },
		stdio: "inherit",
	});
	if (result.status !== 0)
		throw new Error("Storage verification script failed");
}
if (import.meta.main) {
	const provider = process.argv[2];
	if (provider === "down")
		docker([
			"compose",
			"-f",
			"compose.storage.yaml",
			"--profile",
			"rustfs",
			"--profile",
			"garage",
			"--profile",
			"garage-ui",
			"down",
		]);
	else if (provider === "rustfs" || provider === "garage") {
		docker([
			"compose",
			"-f",
			"compose.storage.yaml",
			"--profile",
			provider,
			"up",
			"-d",
			provider,
		]);
		const env = providerEnvironment(provider);
		await waitForStorage(env);
		runScript("scripts/storage-bootstrap.ts", {
			...env,
			STORAGE_DEV_BOOTSTRAP: "true",
		});
		console.info(
			`Development ${provider} ready. See CAPABILITY.md for host/container configuration; credentials were not printed.`,
		);
	} else throw new Error("Choose rustfs, garage, or down");
}
