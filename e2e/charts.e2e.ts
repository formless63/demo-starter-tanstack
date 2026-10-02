import { expect, test } from "@playwright/test";

test("hydrates charts, updates kinds, exposes table fallback, and remounts cleanly", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/charts-test");
	await expect(page.getByRole("heading", { name: "line chart" })).toBeVisible();
	await expect(page.getByRole("table")).toHaveCount(2);
	const labelled = await page.locator('[role="img"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-labelledby")));
	expect(new Set(labelled).size).toBe(2);
	await page.getByRole("button", { name: "Bar" }).click();
	await expect(page.getByRole("heading", { name: "bar chart" })).toBeVisible();
	await page.getByRole("button", { name: "Area" }).click();
	await expect(page.getByRole("heading", { name: "area chart" })).toBeVisible();
	expect(await page.locator("animate, animateTransform").count()).toBe(0);
	await page.reload();
	await expect(page.getByRole("table")).toHaveCount(2);
});
