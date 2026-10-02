import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium,expect } from '@playwright/test';
import { renderToString } from 'react-dom/server';
import { createExamplePayload } from '../src/integrations/internationalization/I18nExample';
import { Harness } from './internationalization-example';
const payload=await createExamplePayload('en');
// Deliberately divergent server punctuation proves initial ICU values are not recomputed.
payload.formatted.currency='SERVER EUR 1 234,50';payload.formatted.date='SERVER 15 January';
const html=renderToString(<Harness payload={payload}/>);
const directory=await mkdtemp(join(tmpdir(),'i18n-browser-'));
const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';
try {await build({configFile:false,mode:'production',plugins:[react()],define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{target:'esnext',outDir:directory,emptyOutDir:true,lib:{entry:fileURLToPath(new URL('./internationalization-client.tsx',import.meta.url)),formats:['es'],fileName:()=> 'client.js'}}});}finally{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
const client=await readFile(join(directory,'client.js'));
const server=createServer((request,response)=>{
 if(request.url==='/client.js'){response.writeHead(200,{'content-type':'application/javascript'}).end(client);return;}
 response.writeHead(200,{'content-type':'text/html'}).end(`<!doctype html><html lang="en" dir="ltr"><head><title>I18n fixture</title></head><body><div id="root">${html}</div><script id="data" type="application/json">${JSON.stringify(payload).replace(/</g,'\\u003c')}</script><script type="module" src="/client.js"></script></body></html>`);
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try {
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors:string[]=[];const external:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('request',request=>{if(!request.url().startsWith(origin))external.push(request.url());});
 await page.goto(origin);await expect(page.getByTestId('currency')).toHaveText('SERVER EUR 1 234,50');
 await page.getByRole('button',{name:'de',exact:true}).click();await expect(page.getByTestId('greeting')).toHaveText('Hallo Ada');
 await page.getByRole('button',{name:'en',exact:true}).click();await expect(page.getByTestId('greeting')).toHaveText('Hello Ada');
 await page.getByRole('button',{name:'Hold German'}).click();await page.getByRole('button',{name:'de',exact:true}).click();await page.getByRole('button',{name:'ar',exact:true}).click();
 await expect(page.getByTestId('greeting')).toHaveText('مرحبًا Ada');await page.getByRole('button',{name:'Release German'}).click();await page.waitForTimeout(250);await expect(page.getByTestId('greeting')).toHaveText('مرحبًا Ada');
 await expect(page.getByRole('region',{name:'Localized example'})).toHaveAttribute('dir','rtl');await expect(page.locator('html')).toHaveAttribute('dir','ltr');
 await expect(page.getByTestId('plural-0')).toHaveText('لا عناصر');await expect(page.getByTestId('plural-2')).toHaveText('عنصران');await expect(page.getByTestId('fallback')).toHaveText('Fallback message');
 await expect(page.getByTestId('literal')).toHaveText('<img src=x onerror=alert(1)>');assert.equal(await page.locator('img').count(),0);
 await page.goBack();await expect(page.getByTestId('greeting')).toHaveText('Hello Ada');await page.goForward();await expect(page.getByTestId('greeting')).toHaveText('مرحبًا Ada');
 await page.getByRole('button',{name:'de',exact:true}).click();await page.goBack();await expect(page.getByTestId('greeting')).toHaveText('Hello Ada');await page.waitForTimeout(250);await expect(page.getByTestId('greeting')).toHaveText('Hello Ada');await page.goForward();await expect(page.getByTestId('greeting')).toHaveText('مرحبًا Ada');
 for (const control of ['Fail changes','Invalid changes']) {await page.getByRole('button',{name:control}).click();await page.getByRole('button',{name:'de',exact:true}).click();await expect(page.getByRole('status')).toHaveText('error');await expect(page.getByTestId('greeting')).toHaveText('مرحبًا Ada');assert.equal(new URL(page.url()).searchParams.get('locale'),'ar');}
 await page.getByRole('button',{name:'Restore changes'}).click();
 await page.getByRole('button',{name:'Fail changes'}).click();await page.goBack();await expect(page.getByRole('status')).toHaveText('error');await expect(page.getByTestId('greeting')).toHaveText('مرحبًا Ada');await expect(page).toHaveURL(/locale=ar/);
 await page.getByRole('button',{name:'Restore changes'}).click();
 await page.getByRole('button',{name:'de',exact:true}).click();await expect(page.getByTestId('greeting')).toHaveText('Hallo Ada');await page.getByRole('button',{name:'ar',exact:true}).click();await expect(page.getByTestId('greeting')).toHaveText('مرحبًا Ada');
 await page.getByRole('button',{name:'Hold German'}).click();await page.goBack();await page.getByRole('button',{name:'Cancel locale change'}).click();await page.getByRole('button',{name:'Release German'}).click();await page.waitForTimeout(250);await expect(page.getByTestId('greeting')).toHaveText('مرحبًا Ada');await expect(page).toHaveURL(/locale=ar/);

 await page.getByRole('button',{name:'de',exact:true}).click();await page.getByRole('button',{name:'Cancel locale change'}).click();await page.waitForTimeout(250);await expect(page.getByTestId('greeting')).toHaveText('مرحبًا Ada');
 await page.getByRole('button',{name:'de',exact:true}).click();await page.getByRole('button',{name:'Toggle example'}).click();await page.waitForTimeout(250);await page.getByRole('button',{name:'Toggle example'}).click();await expect(page.getByTestId('greeting')).toHaveText('Hello Ada');
 await page.getByRole('button',{name:'en',exact:true}).press('Enter');await expect(page.getByRole('status')).toHaveText('idle');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(await page.evaluate(()=>localStorage.length),0);
 console.info('Native Chromium hydration, divergent ICU payload, Arabic RTL/plurals, escaping, rapid changes, cancellation, unmount and Back/Forward passed');
}finally{await browser?.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
