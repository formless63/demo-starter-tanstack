import {waitForPwa} from './pwa-wait';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
import {startConsumer} from './pwa-consumer-server';
const server=await startConsumer();const browser=await chromium.launch();
const closeTabs=async(context:Awaited<ReturnType<typeof browser.newContext>>)=>{for(const tab of context.pages())await tab.close();};
try {
 const worker=await fetch(`${server.origin}/pwa-offline-sw.js`);assert.equal(worker.status,200);assert.match(worker.headers.get('content-type')??'',/javascript/);
 const manifest=await (await fetch(`${server.origin}/manifest.webmanifest`)).json() as {id:string;scope:string};assert.equal(manifest.id,'/');assert.equal(manifest.scope,'/');
 const ssr=await(await fetch(`${server.origin}/pwa-test`)).text();assert.ok(ssr.includes('disabled=""'));
 const context=await browser.newContext({serviceWorkers:'allow'});let page=await context.newPage();await page.goto(`${server.origin}/pwa-test`);await page.getByRole('button',{name:'Enable offline notice'}).click();await waitForPwa(()=>page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.active),'native consumer activation');await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const cacheKeys=await page.evaluate(()=>caches.keys());assert.equal(cacheKeys.length,1);assert.equal(await page.evaluate(async()=>{const keys=await caches.keys();return (await(await caches.open(keys[0])).keys()).length;}),3);
 // Consumer defaults have no navigation fallback, even for the demonstration route.
 await context.setOffline(true);let navigated=false;try{await page.goto(`${server.origin}/pwa-test`);navigated=true;}catch{}assert.equal(navigated,false,'Default consumer fallback paths are empty');await context.setOffline(false);await page.goto(`${server.origin}/pwa-test`);await page.getByRole('button',{name:'Enable offline notice'}).click();
 // Byte-distinct worker, identical embedded version: existing complete cache is reused untouched.
 const emitted=await readFile('dist/client/pwa-offline-sw.js','utf8');await writeFile('dist/client/pwa-offline-sw.js',`${emitted}\n// same-version replacement\n`);
 server.options.denyPng=true;const requests=server.options.assetRequests;
 const sameVersionEvent=context.waitForEvent('serviceworker');await page.getByRole('button',{name:'Check for updates'}).click();const sameVersion=await sameVersionEvent;await waitForPwa(()=>page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting),'native consumer waiting worker');assert.equal(server.options.assetRequests,requests,'Same-version reuse does not refetch or mutate existing cache');
 await closeTabs(context);await sameVersion.evaluate(async()=>{for(let i=0;i<500;i++){if(!(self as unknown as ServiceWorkerGlobalScope).registration.waiting)return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Activation timed out');});
 page=await context.newPage();await page.goto(`${server.origin}/pwa-test`);await page.getByRole('button',{name:'Enable offline notice'}).click();
 assert.deepEqual(await page.evaluate(()=>caches.keys()),cacheKeys);
 // Genuine new native build; a late PNG refusal must not remove prior active cache.
 const sourcePath='src/integrations/pwa-offline/pwa-offline-sw.ts';await writeFile(sourcePath,`${await readFile(sourcePath,'utf8')}\n// native consumer update generation\n`);
 await new Promise<void>((done,reject)=>{const child=spawn(process.execPath,['run','build'],{stdio:'inherit',env:{...process.env,NODE_ENV:'production'}});child.on('error',reject);child.on('exit',code=>code===0?done():reject(new Error('Consumer update build failed')));});
 await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();if(!registration)throw new Error('Missing registration');await new Promise<void>((done,reject)=>{const timer=setTimeout(()=>reject(new Error('Failed update timed out')),15000);registration.addEventListener('updatefound',()=>{const installing=registration.installing;installing?.addEventListener('statechange',()=>{if(installing.state==='redundant'){clearTimeout(timer);done();}});},{once:true});void registration.update();});});
 assert.deepEqual(await page.evaluate(()=>caches.keys()),cacheKeys,'Failed later-resource update preserves old complete cache');server.options.denyPng=false;
 await page.evaluate(async()=>{await(await caches.open('consumer-unrelated')).put('/keep',new Response('keep'));});
 server.options.retire=true;const retireEvent=context.waitForEvent('serviceworker');await page.getByRole('button',{name:'Check for updates'}).click();const retire=await retireEvent;await waitForPwa(()=>page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting),'native consumer waiting worker');await closeTabs(context);await retire.evaluate(async()=>{for(let i=0;i<500;i++){if(!(self as unknown as ServiceWorkerGlobalScope).registration.waiting)return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Retirement timed out');});
 page=await context.newPage();await page.goto(`${server.origin}/pwa-test`);await waitForPwa(()=>page.evaluate(async()=>!(await navigator.serviceWorker.getRegistration())),'native consumer retirement unregistered');assert.deepEqual(await page.evaluate(()=>caches.keys()),['consumer-unrelated']);await context.close();
 console.info('Actual generated Start production HTTP/browser: headers, default-off navigation, same-version replacement, failed late update preserving cache, and same-URL owned retirement passed');
} finally {await browser.close();await server.close();}
