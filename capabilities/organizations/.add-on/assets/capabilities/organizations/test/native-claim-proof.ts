// Compatibility diagnostic, not the capability acceptance suite.
// Owns and removes only a uniquely named disposable PostgreSQL container.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization as organizationPlugin } from "better-auth/plugins/organization";
import { drizzle } from "drizzle-orm/node-postgres";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { Pool } from "pg";

const date = (name: string) => timestamp(name, { withTimezone: true });
const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name"),
	email: text("email"),
	emailVerified: boolean("email_verified"),
	image: text("image"),
	createdAt: date("created_at"),
	updatedAt: date("updated_at"),
});
const session = pgTable("session", {
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
const organization = pgTable("organization", {
	id: text("id").primaryKey(),
	name: text("name"),
	slug: text("slug"),
	logo: text("logo"),
	metadata: text("metadata"),
	createdAt: date("created_at"),
});
const member = pgTable("member", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id"),
	userId: text("user_id"),
	role: text("role"),
	createdAt: date("created_at"),
});
const invitation = pgTable("invitation", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id"),
	email: text("email"),
	role: text("role"),
	status: text("status"),
	inviterId: text("inviter_id"),
	expiresAt: date("expires_at"),
	createdAt: date("created_at"),
});

const account = pgTable("account", {
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
const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier"),
	value: text("value"),
	expiresAt: date("expires_at"),
	createdAt: date("created_at"),
	updatedAt: date("updated_at"),
});

const container = `wave2-org-claim-proof-${randomUUID()}`;
const docker = (...args: string[]) =>
	execFileSync("docker", args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
let pool: Pool | undefined;
try {
	docker(
		"run",
		"-d",
		"--name",
		container,
		"-e",
		"POSTGRES_USER=fixture",
		"-e",
		"POSTGRES_PASSWORD=fixture",
		"-e",
		"POSTGRES_DB=fixture",
		"-p",
		"127.0.0.1::5432",
		"public.ecr.aws/docker/library/postgres:18.1-alpine@sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29",
	);
	const port = docker("port", container, "5432/tcp").trim().split(":").at(-1);
	pool = new Pool({
		connectionString: `postgresql://fixture:fixture@127.0.0.1:${port}/fixture`,
		connectionTimeoutMillis: 1000,
	});
	for (let attempt = 0; ; attempt++) {
		try {
			await pool.query("SELECT 1");
			break;
		} catch {
			if (attempt >= 30)
				throw new Error("Disposable database readiness failed");
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
	}
	await pool.query(`
 CREATE TABLE "user" (id text PRIMARY KEY,name text,email text,email_verified boolean,image text,created_at timestamptz,updated_at timestamptz);
 CREATE TABLE "session" (id text PRIMARY KEY,user_id text,token text,expires_at timestamptz,created_at timestamptz,updated_at timestamptz,ip_address text,user_agent text,active_organization_id text);
 CREATE TABLE account (id text PRIMARY KEY,account_id text,provider_id text,user_id text,access_token text,refresh_token text,id_token text,access_token_expires_at timestamptz,refresh_token_expires_at timestamptz,scope text,password text,created_at timestamptz,updated_at timestamptz);
 CREATE TABLE verification (id text PRIMARY KEY,identifier text,value text,expires_at timestamptz,created_at timestamptz,updated_at timestamptz);
 CREATE TABLE organization (id text PRIMARY KEY,name text,slug text,logo text,metadata text,created_at timestamptz);
 CREATE TABLE member (id text PRIMARY KEY,organization_id text,user_id text,role text,created_at timestamptz,UNIQUE(organization_id,user_id));
 CREATE TABLE invitation (id text PRIMARY KEY,organization_id text,email text,role text,status text,inviter_id text,expires_at timestamptz,created_at timestamptz);
 INSERT INTO "user" VALUES ('recipient','Recipient','recipient@example.test',true,null,now(),now());
 INSERT INTO "session" VALUES ('fixture-session','recipient','fixture-token',now()+interval '1 hour',now(),now(),null,null,null);
 INSERT INTO organization VALUES ('fixture-org','Fixture','fixture',null,null,now());
 CREATE FUNCTION fail_member_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture membership failure'; END $$;
 CREATE TRIGGER fail_member_insert BEFORE INSERT ON member FOR EACH ROW EXECUTE FUNCTION fail_member_insert();
 INSERT INTO invitation VALUES ('fixture-invite','fixture-org','recipient@example.test','member','pending','fixture-owner',now()+interval '1 day',now());
 `);
	const db = drizzle(pool, {
		schema: {
			user,
			session,
			account,
			verification,
			organization,
			member,
			invitation,
		},
	});
	let observed = false;
	const transaction = db.transaction.bind(db);
	db.transaction = async (callback, config) => {
		const result = await pool!.query(
			"SELECT status, (SELECT count(*)::int FROM member) AS members FROM invitation WHERE id='fixture-invite'",
		);
		assert.equal(result.rows[0].status, "accepted");
		assert.equal(result.rows[0].members, 0);
		observed = true;
		return transaction(callback, config);
	};
	const auth = betterAuth({
		baseURL: "http://localhost:3000",
		secret: "disposable-fixture-secret-at-least-thirty-two-characters",
		database: drizzleAdapter(db, { provider: "pg", transaction: true }),
		logger: { disabled: true },
		plugins: [
			organizationPlugin({
				teams: { enabled: false },
				requireEmailVerificationOnInvitation: true,
			}),
		],
	});
	const token = "fixture-token";
	const signature = createHmac(
		"sha256",
		"disposable-fixture-secret-at-least-thirty-two-characters",
	)
		.update(token)
		.digest("base64");
	const headers = new Headers({
		cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`,
	});
	await assert.rejects(
		auth.api.acceptInvitation({
			headers,
			body: { invitationId: "fixture-invite" },
		}),
	);
	assert.equal(observed, true);
	const restored = await pool.query(
		"SELECT status, (SELECT count(*)::int FROM member) AS members FROM invitation WHERE id='fixture-invite'",
	);
	assert.equal(restored.rows[0].status, "pending");
	assert.equal(restored.rows[0].members, 0);
	console.info(
		"PROVED: native claim commits before membership; normal failure compensates to pending (Drizzle transaction:true).",
	);
} finally {
	await pool?.end();
	docker("rm", "-f", container);
}
