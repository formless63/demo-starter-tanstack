import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { env } from "#/env";

const plugins = [] as ReturnType<
	typeof genericOAuth | typeof tanstackStartCookies
>[];

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

plugins.push(tanstackStartCookies());

export const auth = betterAuth({
	appName: "Launchpad",
	baseURL: env.APP_BASE_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
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
	logger: { disabled: true },
});
