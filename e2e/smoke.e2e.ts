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
