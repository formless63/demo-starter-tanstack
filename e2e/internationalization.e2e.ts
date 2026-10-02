import { expect,test } from '@playwright/test';
test('explicit locale SSR hydrates and app-owned history preserves localized state',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error' && /hydration|hydrating|did not match/i.test(message.text()))errors.push(message.text());});
 await page.goto('/i18n-test?locale=ar');
 await expect(page.getByTestId('greeting')).toHaveText('مرحبًا Ada');await expect(page.getByRole('region',{name:'Localized example'})).toHaveAttribute('dir','rtl');
 await expect(page.getByTestId('plural-2')).toHaveText('عنصران');await expect(page.getByTestId('literal')).toHaveText('<img src=x onerror=alert(1)>');
 await expect(page.getByRole('button',{name:'de',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'de',exact:true}).click();await expect(page.getByTestId('greeting')).toHaveText('Hallo Ada');await expect(page).toHaveURL(/locale=de/);
 await page.getByRole('button',{name:'en',exact:true}).click();await expect(page.getByTestId('greeting')).toHaveText('Hello Ada');
 await page.goBack();await expect(page.getByTestId('greeting')).toHaveText('Hallo Ada');await page.goForward();await expect(page.getByTestId('greeting')).toHaveText('Hello Ada');
 await page.getByRole('button',{name:'de',exact:true}).click();await page.getByRole('button',{name:'Cancel locale change'}).click();await page.waitForTimeout(250);await expect(page.getByTestId('greeting')).toHaveText('Hello Ada');await expect(page).toHaveURL(/locale=en/);
 expect(errors).toEqual([]);
});

test('Back during held native locale navigation keeps the canonical committed locale',async({page})=>{
 let hold=false;let started=false;let release!:()=>void;
 const delayed=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/*',async route=>{
  if(hold && ['fetch','xhr'].includes(route.request().resourceType())){started=true;await delayed;}
  await route.continue();
 });
 try {
  await page.goto('/i18n-test?locale=ar');
  const english=page.getByRole('button',{name:'en',exact:true});await expect(english).toBeEnabled();
  hold=true;await english.click();await expect.poll(()=>started).toBe(true);
  await expect(page).toHaveURL(/locale=en/);
  await expect(page.getByTestId('greeting')).toHaveText('مرحبًا Ada');
  await page.goBack();await expect(page).toHaveURL(/locale=ar/);
  await expect(page.getByTestId('greeting')).toHaveText('مرحبًا Ada');
  hold=false;release();await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/locale=ar/);await expect(page.getByTestId('greeting')).toHaveText('مرحبًا Ada');
  await expect(english).toBeEnabled();await english.click();
  await expect(page).toHaveURL(/locale=en/);await expect(page.getByTestId('greeting')).toHaveText('Hello Ada');
 }finally{hold=false;release();}
});
