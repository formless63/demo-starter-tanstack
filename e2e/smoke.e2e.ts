import { expect, test } from "@playwright/test";

test("public landing and protected return-after-login", async ({ page }) => {
	await page.goto("/app/projects?view=recent");
	await expect(page).toHaveURL(
		"/?redirect=%2Fapp%2Fprojects%3Fview%3Drecent",
	);
	await expect(
		page.getByRole("heading", {
			name: /start with the important parts/i,
		}),
	).toBeVisible();

	for (const provider of ["GitHub", "OIDC"]) {
		const signInRequest = page.waitForRequest((request) =>
			request.url().includes("/api/auth/sign-in/social"),
		);
		await page.getByRole("button", { name: `Continue with ${provider}` }).click();
		const payload = (await signInRequest).postDataJSON();
		expect(payload.callbackURL).toBe("/app/projects?view=recent");
	}
});

test("API contract, machine-auth boundary, and interactive docs", async ({
	page,
	request,
}) => {
	const documentResponse = await request.get("/api/openapi.json");
	expect(documentResponse.ok()).toBe(true);
	const document = await documentResponse.json();
	expect(document.openapi).toBe("3.1.1");
	expect(Object.keys(document.paths)).toEqual(["/api/v1/projects"]);

	const unauthorizedResponse = await request.get("/api/v1/projects");
	expect(unauthorizedResponse.status()).toBe(401);
	expect(unauthorizedResponse.headers()["x-request-id"]).toMatch(/^[a-f0-9-]{36}$/);
	await expect(unauthorizedResponse.json()).resolves.toMatchObject({
		error: { code: "unauthorized" },
	});

	await page.goto("/docs/api");
	await expect(page.getByText("Launchpad API", { exact: true }).first()).toBeVisible({
		timeout: 15_000,
	});
	await expect(page.getByText("List projects", { exact: true }).first()).toBeVisible();
});

test("request IDs and safe readiness metadata", async ({ request }) => {
	for (const id of ["e2e.safe-request", "bad request id", "a".repeat(65)]) {
		const response = await request.get("/api/health?token=never-log-me", { headers: { "X-Request-ID": id } });
		expect(response.ok()).toBe(true);
		const returned = response.headers()["x-request-id"];
		if (id === "e2e.safe-request") expect(returned).toBe(id);
		else expect(returned).toMatch(/^[a-f0-9-]{36}$/);
		const body = await response.json();
		expect(body).toMatchObject({ status: "ok", checks: { database: "ok" } });
		expect(body.service).toBeTruthy();
		expect(body.version).toBeTruthy();
		expect(body.revision).toBeTruthy();
		expect(JSON.stringify(body)).not.toMatch(/postgresql|password|"stack"\s*:|never-log-me/);
	}
});
