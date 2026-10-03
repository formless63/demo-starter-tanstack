import {boolean,pgTable,text,timestamp} from "drizzle-orm/pg-core";
const date = (name: string) => timestamp(name, { withTimezone: true });
export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name"),
	email: text("email"),
	emailVerified: boolean("email_verified"),
	image: text("image"),
	createdAt: date("created_at"),
	updatedAt: date("updated_at"),
});
export const session = pgTable("session", {
	id: text("id").primaryKey(),
	userId: text("user_id"),
	token: text("token"),
	expiresAt: date("expires_at"),
	createdAt: date("created_at"),
	updatedAt: date("updated_at"),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	activeOrganizationId: text("active_organization_id"),
});
export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id"),
	providerId: text("provider_id"),
	userId: text("user_id"),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: date("access_token_expires_at"),
	refreshTokenExpiresAt: date("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: date("created_at"),
	updatedAt: date("updated_at"),
});
export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier"),
	value: text("value"),
	expiresAt: date("expires_at"),
	createdAt: date("created_at"),
	updatedAt: date("updated_at"),
});

