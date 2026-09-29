import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { magicLink } from "better-auth/plugins/magic-link";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "#/db";
import { env } from "#/env";

const plugins = [] as ReturnType<
	| typeof apiKey
	| typeof genericOAuth
	| typeof magicLink
	| typeof tanstackStartCookies
>[];

plugins.push(
	apiKey({
		apiKeyHeaders: "x-api-key",
		defaultPrefix: "lp_",
		disableKeyHashing: false,
		enableSessionForAPIKeys: false,
		references: "user",
		requireName: true,
		startingCharactersConfig: { shouldStore: true, charactersLength: 8 },
		permissions: { defaultPermissions: { projects: ["read"] } },
		rateLimit: {
			enabled: true,
			timeWindow: 24 * 60 * 60 * 1000,
			maxRequests: 10_000,
		},
	}),
);

if (env.OIDC_DISCOVERY_URL && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET) {
	plugins.push(
		genericOAuth({
			config: [
				{
					providerId: "oidc",
					name: "OpenID Connect",
					discoveryUrl: env.OIDC_DISCOVERY_URL,
					clientId: env.OIDC_CLIENT_ID,
					clientSecret: env.OIDC_CLIENT_SECRET,
					scopes: ["openid", "profile", "email"],
					pkce: true,
					requireIdTokenVerification: true,
				},
			],
		}),
	);
}

if (env.MAGIC_LINK_ENABLED === "true") {
	plugins.push(
		magicLink({
			storeToken: "hashed",
			async sendMagicLink({ email, url }) {
				// Development-safe transport: replace with a provider integration in production.
				if (env.NODE_ENV === "production")
					throw new Error(
						"Configure an email transport before enabling magic links in production",
					);
				console.info(`[magic-link] ${email}: ${url}`);
			},
		}),
	);
}
plugins.push(tanstackStartCookies());

export const auth = betterAuth({
	appName: "Launchpad",
	baseURL: env.APP_BASE_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: "pg" }),
	emailAndPassword: { enabled: false },
	socialProviders:
		env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
			? {
					github: {
						clientId: env.GITHUB_CLIENT_ID,
						clientSecret: env.GITHUB_CLIENT_SECRET,
					},
				}
			: {},
	account: {
		accountLinking: { enabled: true },
	},
	advanced: { useSecureCookies: env.NODE_ENV === "production" },
	plugins,
});
