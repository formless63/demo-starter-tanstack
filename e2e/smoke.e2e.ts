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
	await expect(unauthorizedResponse.json()).resolves.toMatchObject({
		error: { code: "unauthorized" },
	});

	await page.goto("/docs/api");
	await expect(page.getByText("Launchpad API", { exact: true }).first()).toBeVisible({
		timeout: 15_000,
	});
	await expect(page.getByText("List projects", { exact: true }).first()).toBeVisible();
});
