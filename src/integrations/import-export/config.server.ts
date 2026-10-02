import { TransferError } from "./validation";

function setting(
	env: NodeJS.ProcessEnv,
	name: string,
	fallback: number,
	min: number,
	max: number,
) {
	const raw = env[name];
	if (raw === undefined || raw === "") return fallback;
	if (!/^(0|[1-9][0-9]*)$/.test(raw)) throw new TransferError("configuration");
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < min || value > max)
		throw new TransferError("configuration");
	return value;
}
export function transferConfig(env: NodeJS.ProcessEnv = process.env) {
	return {
		maxBytes: setting(env, "IMPORT_EXPORT_MAX_BYTES", 16777216, 1024, 67108864),
		maxRows: setting(env, "IMPORT_EXPORT_MAX_ROWS", 10000, 1, 100000),
		timeoutSeconds: setting(env, "IMPORT_EXPORT_TIMEOUT_SECONDS", 60, 5, 300),
		artifactTtlSeconds: setting(
			env,
			"IMPORT_EXPORT_ARTIFACT_TTL_SECONDS",
			86400,
			300,
			604800,
		),
	};
}
export type TransferConfig = ReturnType<typeof transferConfig>;
