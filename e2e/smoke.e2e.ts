import { expect, test } from '@playwright/test'
test('public landing and protected redirect', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /start with the important parts/i })).toBeVisible()
  await page.goto('/app/projects')
  await expect(page).toHaveURL('/')
})
