import assert from "node:assert/strict";
import { validate } from "@scalar/openapi-parser";
import { eq } from "drizzle-orm";
import { db } from "#/db";
import { apikey, projects, user } from "#/db/schema";
import { auth } from "#/lib/auth";
import { createOpenApiDocument } from "#/integrations/api-platform/openapi";
import {
	createProjectApi,
	listProjectsApi,
} from "#/integrations/api-platform/projects-api.server";

const userId = `api-smoke-${crypto.randomUUID()}`;

try {
	await db.insert(user).values({
		id: userId,
		name: "API Platform smoke",
		email: `${userId}@example.test`,
	});
	const readKey = await auth.api.createApiKey({
		body: {
			userId,
			name: "smoke read",
			permissions: { projects: ["read"] },
			rateLimitMax: 1_000,
			rateLimitTimeWindow: 60_000,
		},
	});
	const [stored] = await db
		.select({ key: apikey.key })
		.from(apikey)
		.where(eq(apikey.id, readKey.id));
	assert.ok(stored?.key);
	assert.notEqual(stored.key, readKey.key);
	assert.match(readKey.key, /^app_/);
	assert.equal(readKey.key.length, 68);
	assert.equal(readKey.expiresAt, null);
	assert.equal(readKey.rateLimitMax, 1_000);
	assert.equal(readKey.rateLimitTimeWindow, 60_000);

	const listResponse = await listProjectsApi(
		new Request("http://localhost/api/v1/projects", {
			headers: { "x-api-key": readKey.key },
		}),
	);
	assert.equal(listResponse.status, 200);

	const deniedResponse = await createProjectApi(
		new Request("http://localhost/api/v1/projects", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-api-key": readKey.key,
			},
			body: JSON.stringify({ name: "Denied" }),
		}),
	);
	assert.equal(deniedResponse.status, 403);

	const writer = await auth.api.createApiKey({
		body: {
			userId,
			name: "smoke write",
			permissions: { projects: ["write"] },
			rateLimitMax: 1_000,
			rateLimitTimeWindow: 60_000,
		},
	});
	const createResponse = await createProjectApi(
		new Request("http://localhost/api/v1/projects", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-api-key": writer.key,
			},
			body: JSON.stringify({ name: "Smoke project" }),
		}),
	);
	assert.equal(createResponse.status, 201);

	const openapi = createOpenApiDocument();
	const validation = await validate(JSON.stringify(openapi));
	assert.equal(validation.valid, true);
	assert.equal(openapi.openapi, "3.1.1");
	assert.ok(openapi.paths?.["/api/v1/projects"]);
	console.info("API Platform smoke passed");
} finally {
	await db.delete(projects).where(eq(projects.ownerId, userId));
	await db.delete(apikey).where(eq(apikey.referenceId, userId));
	await db.delete(user).where(eq(user.id, userId));
}
