import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { magicLink } from "better-auth/plugins/magic-link";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "#/db";
import { env } from "#/env";
import { resolveEmailConfig } from "#/integrations/email/config.server";
import { renderMagicLinkEmail } from "#/integrations/email/magic-link.server";
import { getApplicationEmail } from "./email.server";

const plugins = [] as ReturnType<
	| typeof apiKey
	| typeof genericOAuth
	| typeof magicLink
	| typeof tanstackStartCookies
>[];

plugins.push(
	apiKey({
		apiKeyHeaders: "x-api-key",
		defaultKeyLength: 64,
		defaultPrefix: "app_",
		disableKeyHashing: false,
		enableSessionForAPIKeys: false,
		keyExpiration: { defaultExpiresIn: null },
		references: "user",
		requireName: true,
		startingCharactersConfig: { shouldStore: true, charactersLength: 8 },
		permissions: { defaultPermissions: { projects: ["read"] } },
		rateLimit: {
			enabled: true,
			timeWindow: 60 * 1000,
			maxRequests: 1_000,
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
	// Validate structure before exposing the flow; never contact SMTP at startup.
	resolveEmailConfig();
	plugins.push(
		magicLink({
			storeToken: "hashed",
			async sendMagicLink({ email, url }) {
				try {
					const content = renderMagicLinkEmail({
						appName: "Launchpad",
						url,
						appBaseUrl: env.APP_BASE_URL,
					});
					const result = await getApplicationEmail().sendEmail({
						to: [{ address: email }],
						...content,
					});
					if (result.outcome !== "accepted")
						throw new Error("Delivery incomplete");
				} catch {
					throw new APIError("SERVICE_UNAVAILABLE", {
						message: "Email delivery unavailable. Please try again later.",
					});
				}
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
