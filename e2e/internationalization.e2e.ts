import { expect,test } from '@playwright/test';
test('explicit locale SSR hydrates and app-owned history preserves localized state',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error' && /hydration|hydrating|did not match/i.test(message.text()))errors.push(message.text());});
 await page.goto('/i18n-test?locale=ar');
 await expect(page.getByTestId('greeting')).toHaveText('مرحبًا Ada');await expect(page.getByRole('region',{name:'Localized example'})).toHaveAttribute('dir','rtl');
 await expect(page.getByTestId('plural-2')).toHaveText('عنصران');await expect(page.getByTestId('literal')).toHaveText('<img src=x onerror=alert(1)>');
 await page.getByRole('button',{name:'de',exact:true}).click();await expect(page.getByTestId('greeting')).toHaveText('Hallo Ada');await expect(page).toHaveURL(/locale=de/);
 await page.getByRole('button',{name:'en',exact:true}).click();await expect(page.getByTestId('greeting')).toHaveText('Hello Ada');
 await page.goBack();await expect(page.getByTestId('greeting')).toHaveText('Hallo Ada');await page.goForward();await expect(page.getByTestId('greeting')).toHaveText('Hello Ada');
 await page.getByRole('button',{name:'de',exact:true}).click();await page.getByRole('button',{name:'Cancel locale change'}).click();await page.waitForTimeout(250);await expect(page.getByTestId('greeting')).toHaveText('Hello Ada');await expect(page).toHaveURL(/locale=en/);
 expect(errors).toEqual([]);
});
