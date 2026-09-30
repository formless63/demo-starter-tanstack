import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import {
	docker,
	providerEnvironment,
	runScript,
	waitForStorage,
} from "./storage-dev";

async function freePort() {
	const server = createServer();
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("No test port");
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
	return address.port;
}
// Only these unique disposable projects/volumes are removed; never a developer stack.
for (const provider of ["rustfs", "garage"] as const) {
	const project = `storage-compat-${provider}-${randomUUID().slice(0, 8)}`;
	const port = await freePort();
	const adminPort = await freePort();
	const compose = [
		"compose",
		"-f",
		"compose.storage.yaml",
		"-p",
		project,
		"--profile",
		provider,
	];
	const overrides =
		provider === "rustfs"
			? { RUSTFS_PORT: String(port), RUSTFS_CONSOLE_PORT: String(adminPort) }
			: { GARAGE_PORT: String(port), GARAGE_ADMIN_PORT: String(adminPort) };
	try {
		docker([...compose, "up", "-d", provider], overrides);
		const environment = {
			...providerEnvironment(provider, port),
			STORAGE_SMOKE_CORS_ORIGIN:
				process.env.STORAGE_DEV_APP_ORIGIN || "http://localhost:3000",
		};
		await waitForStorage(environment);
		runScript("scripts/storage-bootstrap.ts", {
			...environment,
			STORAGE_DEV_BOOTSTRAP: "true",
		});
		runScript(
			process.env.STORAGE_SMOKE_SCRIPT || "scripts/storage-smoke.ts",
			environment,
		);
		if (process.env.STORAGE_SMOKE_IMAGE) {
			const containerEnvironment = {
				...environment,
				STORAGE_ENDPOINT: `http://${provider}:${provider === "rustfs" ? 9000 : 3900}`,
			};
			const envArgs = Object.entries(containerEnvironment).flatMap(
				([key, value]) => ["-e", `${key}=${value}`],
			);
			docker([
				"run",
				"--rm",
				"--network",
				`${project}_default`,
				...envArgs,
				process.env.STORAGE_SMOKE_IMAGE,
				"node",
				".output/storage-smoke.mjs",
			]);
		}
		console.info(`${provider}: complete common compatibility contract passed`);
	} finally {
		docker([...compose, "down", "--volumes", "--remove-orphans"], overrides);
	}
}
