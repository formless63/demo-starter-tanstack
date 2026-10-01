import { spawnSync } from "node:child_process";

export function docker(args: string[], env: NodeJS.ProcessEnv = {}) {
	const result = spawnSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
		env: { ...process.env, ...env, DOCKER_HOST: "", DOCKER_CONTEXT: "", DOCKER_TLS: "", DOCKER_TLS_VERIFY: "", DOCKER_CERT_PATH: "" },
		stdio: "inherit",
		timeout: 180000,
	});
	if (result.status !== 0) throw new Error("Disposable cache Docker operation failed");
}
if (import.meta.main) {
	const action = process.argv[2];
	if (action !== "valkey" && action !== "down") throw new Error("Choose valkey or down");
	docker(["compose", "-f", "compose.cache.yaml", "-p", "cache-development", ...(action === "down" ? ["down", "--volumes", "--remove-orphans"] : ["up", "-d", "--wait", "--wait-timeout", "45"])]);
}
