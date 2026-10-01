import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "#/db";
import { apikey, projects, user } from "#/db/schema";
import { auth } from "#/lib/auth";
import { toSafeApiKeyMetadata } from "./api-keys.server";
import { createProjectApi, listProjectsApi } from "./projects-api.server";

const userAId = `api-user-a-${crypto.randomUUID()}`;
const userBId = `api-user-b-${crypto.randomUUID()}`;
const userAProjectId = crypto.randomUUID();
const userBProjectId = crypto.randomUUID();

async function createKey(
	name: string,
	permissions: { projects: Array<"read" | "write"> },
	rateLimitMax = 1_000,
) {
	return auth.api.createApiKey({
		body: {
			userId: userAId,
			name,
			permissions,
			rateLimitEnabled: true,
			rateLimitMax,
			rateLimitTimeWindow: 60_000,
		},
	});
}

function apiRequest(method: "GET" | "POST", key?: string, body?: unknown) {
	return new Request("http://localhost/api/v1/projects", {
		method,
		headers: {
			...(key ? { "x-api-key": key } : {}),
			...(body === undefined ? {} : { "content-type": "application/json" }),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

describe("API Platform machine authentication and Projects routes", () => {
	beforeAll(async () => {
		await db.insert(user).values([
			{ id: userAId, name: "API User A", email: `${userAId}@example.test` },
			{ id: userBId, name: "API User B", email: `${userBId}@example.test` },
		]);
		await db.insert(projects).values([
			{
				id: userAProjectId,
				ownerId: userAId,
				name: "A private project",
			},
			{
				id: userBProjectId,
				ownerId: userBId,
				name: "B private project",
			},
		]);
	});

	afterAll(async () => {
		await db.delete(apikey).where(eq(apikey.referenceId, userAId));
		await db.delete(user).where(eq(user.id, userAId));
		await db.delete(user).where(eq(user.id, userBId));
	});

	it("hashes a newly created key and exposes its secret only in the creation result", async () => {
		const created = await createKey("hash proof", { projects: ["read"] });
		const [stored] = await db
			.select()
			.from(apikey)
			.where(eq(apikey.id, created.id));

		expect(created.key).toMatch(/^app_/);
		expect(created.key).toHaveLength(68);
		expect(created.rateLimitMax).toBe(1_000);
		expect(created.rateLimitTimeWindow).toBe(60_000);
		expect(created.expiresAt).toBeNull();
		expect(stored?.key).toBeTruthy();
		expect(stored?.key).not.toBe(created.key);
		expect(stored?.key).not.toContain(created.key);
		expect(toSafeApiKeyMetadata(created)).not.toHaveProperty("key");
	});

	it("returns 401 for missing, random, disabled, and expired credentials", async () => {
		await expect(listProjectsApi(apiRequest("GET"))).resolves.toMatchObject({
			status: 401,
		});
		await expect(
			listProjectsApi(apiRequest("GET", "app_random-invalid-key")),
		).resolves.toMatchObject({ status: 401 });
		const queryCredential = await createKey("query rejected", {
			projects: ["read"],
		});
		await expect(
			listProjectsApi(
				new Request(
					`http://localhost/api/v1/projects?apiKey=${encodeURIComponent(queryCredential.key)}`,
				),
			),
		).resolves.toMatchObject({ status: 401 });

		const disabled = await createKey("disabled", { projects: ["read"] });
		await db
			.update(apikey)
			.set({ enabled: false })
			.where(eq(apikey.id, disabled.id));
		await expect(
			listProjectsApi(apiRequest("GET", disabled.key)),
		).resolves.toMatchObject({ status: 401 });

		const expired = await createKey("expired", { projects: ["read"] });
		await db
			.update(apikey)
			.set({ expiresAt: new Date(Date.now() - 60_000) })
			.where(eq(apikey.id, expired.id));
		await expect(
			listProjectsApi(apiRequest("GET", expired.key)),
		).resolves.toMatchObject({ status: 401 });
	});

	it("allows reads, denies writes without permission, and isolates another user's data", async () => {
		const readOnly = await createKey("read only", { projects: ["read"] });
		const readResponse = await listProjectsApi(apiRequest("GET", readOnly.key));
		expect(readResponse.status).toBe(200);
		const body = await readResponse.json();
		expect(body.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: userAProjectId,
					name: "A private project",
				}),
			]),
		);
		expect(body.data).not.toEqual(
			expect.arrayContaining([expect.objectContaining({ id: userBProjectId })]),
		);

		const denied = await createProjectApi(
			apiRequest("POST", readOnly.key, { name: "Forbidden write" }),
		);
		expect(denied.status).toBe(403);
		expect(await denied.json()).toMatchObject({ error: { code: "forbidden" } });
		expect(
			await db
				.select()
				.from(projects)
				.where(
					and(
						eq(projects.ownerId, userAId),
						eq(projects.name, "Forbidden write"),
					),
				),
		).toHaveLength(0);
	});

	it("allows a write-capable key to create only for its owning user", async () => {
		const writer = await createKey("writer", { projects: ["write"] });
		const response = await createProjectApi(
			apiRequest("POST", writer.key, {
				name: "Created through v1",
				description: "machine API",
			}),
		);
		expect(response.status).toBe(201);
		const body = await response.json();
		expect(body.data).toMatchObject({ name: "Created through v1" });

		const [persisted] = await db
			.select()
			.from(projects)
			.where(eq(projects.id, body.data.id));
		expect(persisted?.ownerId).toBe(userAId);
	});

	it("returns 400 for malformed JSON and 422 for invalid request data", async () => {
		const writer = await createKey("validation writer", {
			projects: ["write"],
		});
		const malformed = new Request("http://localhost/api/v1/projects", {
			method: "POST",
			headers: { "x-api-key": writer.key, "content-type": "application/json" },
			body: "{",
		});
		expect((await createProjectApi(malformed)).status).toBe(400);
		const invalid = await createProjectApi(
			apiRequest("POST", writer.key, { name: "" }),
		);
		expect(invalid.status).toBe(422);
		expect(await invalid.json()).toMatchObject({
			error: { code: "validation_error", details: expect.any(Array) },
		});
	});
	it("persists 120/1000-character Project inputs and rejects either overflow", async () => {
		const writer = await createKey("bounded writer", { projects: ["write"] });
		const input = { name: "n".repeat(120), description: "d".repeat(1000) };
		const accepted = await createProjectApi(
			apiRequest("POST", writer.key, input),
		);
		expect(accepted.status).toBe(201);
		const body = await accepted.json();
		expect(body.data).toMatchObject(input);
		const [persisted] = await db
			.select()
			.from(projects)
			.where(eq(projects.id, body.data.id));
		expect(persisted).toMatchObject({ ...input, ownerId: userAId });
		for (const invalid of [
			{ ...input, name: "n".repeat(121) },
			{ ...input, description: "d".repeat(1001) },
		]) {
			expect(
				(await createProjectApi(apiRequest("POST", writer.key, invalid)))
					.status,
			).toBe(422);
		}
	});

	it("never turns an API key into a browser session", async () => {
		const created = await createKey("no session", { projects: ["read"] });
		await expect(
			auth.api.getSession({
				headers: new Headers({ "x-api-key": created.key }),
			}),
		).resolves.toBeNull();
		const managementResponse = await auth.handler(
			new Request("http://localhost/api/auth/api-key/list", {
				headers: { "x-api-key": created.key },
			}),
		);
		expect(managementResponse.status).toBe(401);
	});

	it("returns 429 when the configured key-level rate limit is exceeded", async () => {
		const limited = await createKey("limited", { projects: ["read"] }, 1);
		expect((await listProjectsApi(apiRequest("GET", limited.key))).status).toBe(
			200,
		);
		const response = await listProjectsApi(apiRequest("GET", limited.key));
		expect(response.status).toBe(429);
		expect(await response.json()).toMatchObject({
			error: { code: "rate_limited" },
		});
	});
});
