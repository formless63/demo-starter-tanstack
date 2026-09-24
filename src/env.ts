import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const optionalUrl = z.preprocess(
	(value) => (value === "" ? undefined : value),
	z.url().optional(),
);
const optionalString = z.preprocess(
	(value) => (value === "" ? undefined : value),
	z.string().min(1).optional(),
);

export const env = createEnv({
	server: {
		DATABASE_URL: z
			.string()
			.url()
			.default("postgresql://starter:starter@localhost:5432/starter"),
		BETTER_AUTH_SECRET: z
			.string()
			.min(32)
			.default("development-only-secret-change-me-now"),
		APP_BASE_URL: z.url().default("http://localhost:3000"),
		GITHUB_CLIENT_ID: optionalString,
		GITHUB_CLIENT_SECRET: optionalString,
		OIDC_DISCOVERY_URL: optionalUrl,
		OIDC_CLIENT_ID: optionalString,
		OIDC_CLIENT_SECRET: optionalString,
		MAGIC_LINK_ENABLED: z.enum(["true", "false"]).default("false"),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
	},
	clientPrefix: "VITE_",
	client: { VITE_APP_NAME: z.string().min(1).default("Launchpad") },
	runtimeEnv:
		typeof import.meta !== "undefined" ? import.meta.env : process.env,
	emptyStringAsUndefined: true,
});
