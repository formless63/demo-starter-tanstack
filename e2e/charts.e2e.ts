import { expect, test } from "@playwright/test";

test("hydrates charts, updates kinds, exposes table fallback, and remounts cleanly", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/charts-test");
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await expect(page.locator(".recharts-line-curve")).toHaveCount(1);
	await expect(page.getByRole("table")).toHaveCount(2);
	const labelled = await page.locator('[role="img"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-labelledby")));
	expect(new Set(labelled).size).toBe(2);
	const lineGeometry = await page.locator(".recharts-line-curve").getAttribute("d");
	await page.getByRole("button", { name: "Bar" }).click();
	await expect(page.locator(".recharts-rectangle")).toHaveCount(3);
	const barGeometry = await page.locator(".recharts-rectangle").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("height")));
	expect(barGeometry.some((height) => Number(height) > 0)).toBe(true);
	expect(barGeometry.join(",")).not.toBe(lineGeometry);
	await page.getByRole("button", { name: "Area" }).click();
	await expect(page.locator(".recharts-area-curve")).toHaveCount(1);
	expect(await page.locator("animate, animateTransform").count()).toBe(0);
	await page.getByRole("button", { name: "Unmount" }).click();
	await expect(page.getByTestId("primary-chart")).toHaveCount(0);
	await page.getByRole("button", { name: "Mount" }).click();
	await expect(page.locator(".recharts-area-curve")).toHaveCount(1);
	await page.setViewportSize({ width: 800, height: 600 });
	await expect(page.locator("[data-testid=primary-chart] svg")).toHaveAttribute("width", /.+/);
	await expect(page.getByRole("table")).toHaveCount(2);
	expect(errors).toEqual([]);
});
