import assert from "node:assert/strict";

// Only invoked by the owned disposable Garage fixture; never print credentials/responses.
const endpoint = new URL(process.env.GARAGE_UI_SMOKE_URL || "");
assert.equal(endpoint.hostname, "127.0.0.1");
assert.equal(endpoint.protocol, "http:");
const adminToken = "local-garage-admin-only-not-for-production";
async function request(path: string, init: RequestInit = {}) {
	return fetch(new URL(path, endpoint), {
		...init,
		signal: AbortSignal.timeout(15_000),
	});
}
async function json(path: string, headers: HeadersInit = {}) {
	const response = await request(path, { headers });
	assert.ok(response.ok, `Garage UI read failed: ${path} (${response.status})`);
	return response.json();
}
async function unauthorized(path: string, init: RequestInit = {}) {
	const response = await request(path, init);
	await response.arrayBuffer();
	assert.equal(response.status, 401);
}
const health = await json("/health");
assert.equal(health.data.status, "healthy");
assert.match(health.data.version, /^v?0\.13\.0$/);
const page = await request("/");
assert.equal(page.ok, true);
await page.arrayBuffer();
const config = await json("/auth/config");
assert.equal(config.token.enabled, true);
assert.equal(config.admin.enabled, false);
assert.equal(config.oidc.enabled, false);
await unauthorized("/api/v1/buckets");
await unauthorized("/api/v1/buckets", {
	headers: { Authorization: "Bearer invalid-session" },
});
await unauthorized("/auth/login-token", {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({ token: "invalid-admin-token" }),
});
const login = await request("/auth/login-token", {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({ token: adminToken }),
});
assert.ok(login.ok);
const session = await login.json();
assert.ok(
	session.success === true &&
		typeof session.token === "string" &&
		session.token.length > 0,
);
const headers = { Authorization: `Bearer ${session.token}` };
assert.equal((await json("/auth/me", headers)).user.username, "admin-token");
const buckets = await json("/api/v1/buckets", headers);
assert.ok(
	buckets.success === true &&
		buckets.data.buckets.some(
			(bucket: { name: string }) => bucket.name === process.env.STORAGE_BUCKET,
		),
);
// Cluster status exercises the configured Admin API; listing objects exercises the S3 endpoint/region.
assert.equal((await json("/api/v1/cluster/status", headers)).success, true);
assert.equal(
	(
		await json(
			`/api/v1/buckets/${process.env.STORAGE_BUCKET}/objects/`,
			headers,
		)
	).success,
	true,
);
console.info(
	"Noooste Garage UI v0.13.0: health, token rejection/login, Admin API and S3 reads passed",
);
