import { expect,test } from '@playwright/test';

test('installed Markdown reference SSR, hydration, safe links/images and clipboard',async ({page,context,request}) => {
 const response = await request.get('/markdown-test');
 expect(response.ok()).toBeTruthy();
 const html = await response.text();
 expect(html).toContain('Safe Markdown');
 expect(html).toContain('Copy typescript code');
 expect(html).not.toContain('<script>window.markdownExecuted');
 const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await page.goto('/markdown-test');
 const content = page.getByRole('region',{name:'Markdown content'});
 await expect(content.getByRole('heading',{name:'Safe Markdown'})).toBeVisible();
 await expect(content.locator('img')).toHaveCount(0);
 await expect(content.locator('a[href^="javascript:"]')).toHaveCount(0);
 expect(await page.evaluate(()=>Object.hasOwn(window,'markdownExecuted'))).toBeFalsy();
 await content.getByRole('button',{name:'Copy typescript code'}).press('Enter');
 await expect(content.getByRole('status').first()).toHaveText('Copied');
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('const message = "Hello, Markdown"\n');
 await page.getByRole('button',{name:'Toggle content'}).click();
 await expect(content).toHaveCount(0);
 await page.getByRole('button',{name:'Toggle content'}).click();
 await expect(content.getByRole('status').first()).toHaveText('');
 expect(errors).toEqual([]);
});
