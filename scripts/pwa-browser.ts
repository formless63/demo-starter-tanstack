import assert from 'node:assert/strict';
import { mkdtemp,cp,writeFile,readFile,rm,mkdir,symlink,stat,readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium,expect,type Page,type BrowserContext } from '@playwright/test';
const root=process.cwd();const directory=await mkdtemp(join(tmpdir(),'pwa-native-'));
async function command(args:string[]) {
 await new Promise<void>((done,reject)=>{const child=spawn(process.execPath,args,{cwd:directory,stdio:'inherit',env:{...process.env,NODE_ENV:'production'}});child.on('error',reject);child.on('exit',code=>code===0?done():reject(new Error(`PWA fixture command failed: ${code}`)));});
}
let servingBase='/';let privateReads=0;let unsafeHeaders=false;let errorPage=false;let tamper=false;
const publicCredentials:string[]=[];
const httpTrace: {path:string;status:number;type:string;cache:string;cookiePresent:boolean;destination:string;mode:string}[]=[];
async function waitForWorker(page:Page,label:string,predicate:()=>unknown|Promise<unknown>) {
 console.info(`[PWA stage] ${label}`);
 try {await page.waitForFunction(predicate,undefined,{timeout:30000});}
 catch(error){
  const state=await page.evaluate(async()=>({path:location.pathname,secure:window.isSecureContext,online:navigator.onLine,controller:navigator.serviceWorker.controller?.scriptURL,registrations:(await navigator.serviceWorker.getRegistrations()).map(registration=>({scope:registration.scope,active:registration.active?{url:registration.active.scriptURL,state:registration.active.state}:null,installing:registration.installing?{url:registration.installing.scriptURL,state:registration.installing.state}:null,waiting:registration.waiting?{url:registration.waiting.scriptURL,state:registration.waiting.state}:null})),statuses:Array.from(document.querySelectorAll('output')).map(element=>element.textContent),caches:await caches.keys()})).catch(()=>({diagnostics:'page unavailable'}));
  console.error(`[PWA failed] ${label}`,JSON.stringify({state,http:httpTrace.slice(-20)}));
  throw new Error(`PWA stage failed: ${label}`,{cause:error});
 }
 console.info(`[PWA passed] ${label}`);
}
function observe(context:BrowserContext,label:string){
 context.on('console',message=>{if(message.type()==='error')console.error(`[PWA ${label} console] ${message.text()}`);});
 context.on('weberror',error=>console.error(`[PWA ${label} page error] ${error.error().message}`));
 context.on('serviceworker',worker=>{console.info(`[PWA ${label} worker] ${worker.url()}`);worker.on('close',()=>console.info(`[PWA ${label} worker closed] ${worker.url()}`));});
}

const server=createServer(async(request,response)=>{
 try{
  const url=new URL(request.url??'/','http://fixture');
  const requestedPath=url.pathname;response.on('finish',()=>{httpTrace.push({path:requestedPath,status:response.statusCode,type:String(response.getHeader('content-type')??''),cache:String(response.getHeader('cache-control')??''),cookiePresent:!!request.headers.cookie,destination:String(request.headers['sec-fetch-dest']??''),mode:String(request.headers['sec-fetch-mode']??'')});if(httpTrace.length>100)httpTrace.shift();});
  if(url.pathname==='/login'){response.setHeader('set-cookie','session=private-user; Path=/; SameSite=Lax');response.end('signed in');return;}
  if(url.pathname==='/logout'){response.setHeader('set-cookie','session=; Path=/; Max-Age=0');response.end('signed out');return;}
  if(url.pathname==='/api/private'){privateReads++;response.setHeader('content-type','application/json');response.setHeader('cache-control','private, no-store');response.end(JSON.stringify({session:request.headers.cookie??'anonymous',nonce:privateReads}));return;}
  if(url.pathname==='/pwa-test'&&errorPage){response.statusCode=503;response.end('Real server failure');return;}
  if(servingBase!=='/'&&url.pathname.startsWith(servingBase))url.pathname='/'+url.pathname.slice(servingBase.length);
  const relative=url.pathname.replace(/^\//,'');
  const file=join(directory,'dist/client',relative);
  if(!file.startsWith(join(directory,'dist/client')+'/')){response.statusCode=400;response.end();return;}
  let bytes:Buffer;
  try{assert.ok((await stat(file)).isFile());bytes=await readFile(file);}catch{bytes=await readFile(join(directory,'dist/client/index.html'));}
  if(relative.startsWith('pwa-offline/'))publicCredentials.push(request.headers.cookie??'');
  if(tamper&&relative==='pwa-offline/offline.html')bytes=Buffer.from('private surprise');
  response.setHeader('content-type',relative.endsWith('.js')?'text/javascript':relative.endsWith('.png')?'image/png':relative.endsWith('.webmanifest')?'application/manifest+json':'text/html; charset=utf-8');
  response.setHeader('cache-control',relative.startsWith('pwa-offline/')?(unsafeHeaders?'private, no-store':relative.endsWith('.png')?'public, max-age=31536000, immutable':'public, max-age=300'):'no-store');
  response.end(bytes);
 }catch(error){response.statusCode=500;response.end(String(error));}
});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try {
 await cp(join(root,'src/integrations/pwa-offline'),join(directory,'src/integrations/pwa-offline'),{recursive:true});
 await mkdir(join(directory,'scripts'),{recursive:true});await cp(join(root,'scripts/pwa-vite.ts'),join(directory,'scripts/pwa-vite.ts'));await cp(join(root,'scripts/pwa-client-fixture.tsx'),join(directory,'scripts/pwa-client-fixture.tsx'));
 await cp(join(root,'public/pwa-offline'),join(directory,'public/pwa-offline'),{recursive:true});
 await symlink(join(root,'node_modules'),join(directory,'node_modules'),'dir');
 await writeFile(join(directory,'package.json'),JSON.stringify({type:'module'}));
 const configFile=join(directory,'src/integrations/pwa-offline/config.ts');
 const config=(await readFile(configFile,'utf8')).replace(/publicOfflinePaths:.*?as string\[\]/,"publicOfflinePaths: ['pwa-test'] as string[]");await writeFile(configFile,config);
 await writeFile(join(directory,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PWA production fixture</title><div id="root"></div><script type="module" src="/scripts/pwa-client-fixture.tsx"></script></html>');
 await writeFile(join(directory,'vite.config.ts'),"import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import {pwaOffline} from './scripts/pwa-vite';export default defineConfig({plugins:[react(),...pwaOffline()],build:{outDir:'dist/client'}});");
 await command(['x','vite','build']);
 const built=await readFile(join(directory,'dist/client/pwa-offline-sw.js'),'utf8');
 assert.ok(!built.includes('__WB_MANIFEST'),'Native production injection completed');
 assert.ok(!built.includes('manifest.webmanifest'),'Manifest is not silently precached');
 if(process.argv.includes('--build-only')){console.info('Native production fixture build and exact injected manifest passed; browser not run');process.exitCode=0;}
 else {browser=await chromium.launch();
 const context=await browser.newContext({serviceWorkers:'allow'});observe(context,'root');let page=await context.newPage();await page.goto(`${origin}/pwa-test`);
 await page.evaluate(()=>fetch('/login',{method:'POST'}));
 await page.getByRole('button',{name:'Enable offline notice'}).click();
 await waitForWorker(page,'root initial activation',async()=>!!(await navigator.serviceWorker.getRegistration())?.active);
 console.info('[PWA precache credential observations]',JSON.stringify({count:publicCredentials.length,withCookie:publicCredentials.filter(value=>value!=='').length,requests:httpTrace.filter(item=>item.path.startsWith('/pwa-offline/'))}));
 assert.ok(publicCredentials.length>=3&&publicCredentials.every(value=>value===''),'Precache install sent no session cookies');
 await page.reload();await waitForWorker(page,'root first controlled reload',()=>!!navigator.serviceWorker.controller);
 await page.evaluate(()=>fetch('/api/private'));await page.evaluate(()=>fetch('/logout',{method:'POST'}));await page.evaluate(()=>fetch('/api/private'));
 const keys=await page.evaluate(async()=>{const result:string[]=[];for(const key of await caches.keys())for(const request of await (await caches.open(key)).keys())result.push(request.url);return result;});
 assert.equal(keys.length,3);assert.ok(keys.every(url=>new URL(url).pathname.startsWith('/pwa-offline/')));
 await page.evaluate(()=>window.dispatchEvent(new Event('beforeinstallprompt')));await expect(page.getByRole('button',{name:'Install app'})).toBeDisabled();
 await page.getByRole('button',{name:'Toggle panel'}).click();await page.getByRole('button',{name:'Toggle panel'}).click();
 await context.setOffline(true);await page.goto(`${origin}/pwa-test`);await expect(page.getByRole('heading',{name:'You are offline'})).toBeVisible();
 assert.equal(await page.evaluate(()=>fetch('/api/private').then(()=>true,()=>false)),false);
 let privateOffline=false;try{await page.goto(`${origin}/private`);privateOffline=true;}catch{}assert.equal(privateOffline,false,'Private navigation has no offline fallback');
 await context.setOffline(false);await page.goto(`${origin}/pwa-test`);
 errorPage=true;const failure=await page.goto(`${origin}/pwa-test`);assert.equal(failure?.status(),503);await expect(page.locator('body')).toContainText('Real server failure');errorPage=false;await page.goto(`${origin}/pwa-test`);
 await page.getByRole('button',{name:'Enable offline notice'}).click();
 await page.getByLabel('Unsaved draft').fill('Do not lose this draft');
 const second=await context.newPage();await second.goto(`${origin}/pwa-test`);await waitForWorker(second,'second controlled tab',()=>!!navigator.serviceWorker.controller);
 await writeFile(join(directory,'src/integrations/pwa-offline/pwa-offline-sw.ts'),`${await readFile(join(directory,'src/integrations/pwa-offline/pwa-offline-sw.ts'),'utf8')}\n// fixture version two\n`);
 await command(['x','vite','build']);
 const updateWorker=context.waitForEvent('serviceworker');await page.getByRole('button',{name:'Check for updates'}).click();const waitingWorker=await updateWorker;await waitForWorker(page,'updated worker waiting',async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting);
 await expect(page.getByRole('button',{name:'Later'})).toBeVisible();await page.getByRole('button',{name:'Later'}).click();await expect(page.getByLabel('Unsaved draft')).toHaveValue('Do not lose this draft');
 await page.close();assert.equal(await second.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting),true,'Other open tab prevents activation');
 await second.close();await waitingWorker.evaluate(async()=>{for(let attempts=0;attempts<500;attempts++){if(!(self as unknown as ServiceWorkerGlobalScope).registration.waiting)return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Natural activation timed out');});page=await context.newPage();await page.goto(`${origin}/pwa-test`);await waitForWorker(page,'new version naturally active',async()=>{const registration=await navigator.serviceWorker.getRegistration();return !!registration?.active&&!registration.waiting;});
 await page.evaluate(async()=>{await (await caches.open('unrelated-owner')).put('/unrelated',new Response('keep'));});
 await page.getByRole('button',{name:'Enable offline notice'}).click();
 await writeFile(configFile,config.replace('retired: false','retired: true'));await command(['x','vite','build']);
 const retirementEvent=context.waitForEvent('serviceworker');await page.getByRole('button',{name:'Check for updates'}).click();const retiringWorker=await retirementEvent;await waitForWorker(page,'retirement worker waiting',async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting);await page.close();await retiringWorker.evaluate(async()=>{for(let attempts=0;attempts<500;attempts++){if(!(self as unknown as ServiceWorkerGlobalScope).registration.waiting)return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Natural activation timed out');});
 page=await context.newPage();await page.goto(`${origin}/pwa-test`);await waitForWorker(page,'retirement unregistered',async()=>!(await navigator.serviceWorker.getRegistration()));
 assert.deepEqual(await page.evaluate(()=>caches.keys()),['unrelated-owner'],'Retirement deletes only owned caches');
 const retirement=await readFile(join(directory,'dist/client/pwa-offline-sw.js'));
 // Save a fixture-only proof and exact persistent retirement artifact before code removal.
 if(JSON.parse(await readFile(join(root,'package.json'),'utf8')).name==='pwa-offline-clean-install'){
  await writeFile(join(root,'public/pwa-offline-sw.js'),retirement);
  await writeFile(join(root,'.pwa-retirement-proof.json'),JSON.stringify({sha256:createHash('sha256').update(retirement).digest('hex'),scope:'/',filename:'pwa-offline-sw.js'}));
 }
 await context.close();
 // Native install rejects both privacy headers and changed bytes before caching.
 await writeFile(configFile,config);await command(['x','vite','build']);
 for(const mode of ['headers','integrity']){
  unsafeHeaders=mode==='headers';tamper=mode==='integrity';const denied=await browser.newContext();observe(denied,mode);console.info(`[PWA stage] rejects ${mode}`);const tab=await denied.newPage();await tab.goto(`${origin}/pwa-test`);await tab.getByRole('button',{name:'Enable offline notice'}).click();
  await expect(tab.getByRole('status').first()).toContainText('error');
  assert.equal(await tab.evaluate(async()=>(await caches.keys()).filter(key=>key.startsWith('pwa-offline:')).length),0);await denied.close();
 }
 unsafeHeaders=false;tamper=false;
 servingBase='/demo/';
 await writeFile(configFile,config.replace(/base:\s*['"]\/['"]/,'base: "/demo/"'));
 await writeFile(join(directory,'vite.config.ts'),"import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import {pwaOffline} from './scripts/pwa-vite';export default defineConfig({base:'/demo/',plugins:[react(),...pwaOffline()],build:{outDir:'dist/client'}});");
 await command(['x','vite','build']);
 for(const asset of ['pwa-offline-sw.js',...await readdir(join(directory,'public/pwa-offline')).then(files=>files.map(file=>`pwa-offline/${file}`))]){
  const response=await fetch(`${origin}/demo/${asset}`);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.deepEqual(bytes,await readFile(join(directory,'dist/client',asset)));console.info('[PWA scoped HTTP]',JSON.stringify({path:`/demo/${asset}`,status:response.status,type:response.headers.get('content-type'),cache:response.headers.get('cache-control'),sha256:createHash('sha256').update(bytes).digest('hex')}));
 }
 const scoped=await browser.newContext();observe(scoped,'scoped');const scopedPage=await scoped.newPage();await scopedPage.goto(`${origin}/demo/pwa-test`);await scopedPage.getByRole('button',{name:'Enable offline notice'}).click();await waitForWorker(scopedPage,'scoped /demo/ initial activation',async()=>!!(await navigator.serviceWorker.getRegistration())?.active);
 assert.equal(await scopedPage.evaluate(async()=>(await navigator.serviceWorker.getRegistration())?.scope),`${origin}/demo/`);
 await scopedPage.reload();await waitForWorker(scopedPage,'scoped /demo/ first controlled reload',()=>!!navigator.serviceWorker.controller);await scoped.setOffline(true);await scopedPage.goto(`${origin}/demo/pwa-test`);await expect(scopedPage.getByRole('heading',{name:'You are offline'})).toBeVisible();await scoped.close();
 console.info('Native production worker: offline/public-only, credential-free integrity, private login/logout, HTTP errors, synthetic install, multi-tab Later/draft-preserving update and owned retirement passed');
 }
} finally {await browser?.close();await new Promise<void>(done=>server.close(()=>done()));await rm(directory,{recursive:true,force:true});}
