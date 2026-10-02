import { expect } from '@playwright/test';

// page.waitForFunction in the pinned browser driver checks a returned Promise
// for truthiness before its boolean value settles. Poll outside the browser,
// await page.evaluate's resolved result, and require actual true every time.
export async function waitForPwa(condition: () => boolean | Promise<boolean>, label: string) {
 await expect.poll(condition, {timeout: 30000, message: label}).toBe(true);
}
