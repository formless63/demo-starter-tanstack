import {waitForPwa} from '../scripts/pwa-wait';
import { test,expect } from '@playwright/test';
test('PWA reference hydration and truthful install state',async({page,request})=>{
 const html=await request.get('/pwa-test');expect(html.status()).toBe(200);expect(await html.text()).toContain('disabled=""');
 await page.goto('/pwa-test');await expect(page.getByRole('heading',{name:'PWA / Offline',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Enable offline notice'})).toBeEnabled();
 await page.evaluate(()=>window.dispatchEvent(new Event('beforeinstallprompt')));await expect(page.getByRole('button',{name:'Install app'})).toBeDisabled();
});
test('production native reference worker public-only cache',async({page,request,context})=>{
 test.skip(!process.env.E2E_BASE_URL,'Actual root worker is production-only; native lifecycle runs separately in every mode');
 const worker=await request.get('/pwa-offline-sw.js');expect(worker.status()).toBe(200);expect(worker.headers()['content-type']).toMatch(/javascript/);
 await page.goto('/pwa-test');await page.getByRole('button',{name:'Enable offline notice'}).click();await waitForPwa(()=>page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.active),'root native PWA activation');await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const paths=await page.evaluate(async()=>{const results:string[]=[];for(const key of await caches.keys())if(key.startsWith('pwa-offline:'))for(const item of await (await caches.open(key)).keys())results.push(new URL(item.url).pathname);return results;});expect(paths).toHaveLength(3);expect(paths.every(path=>path.startsWith('/pwa-offline/'))).toBe(true);
 await context.setOffline(true);await page.goto('/pwa-test');await expect(page.getByRole('heading',{name:'You are offline'})).toBeVisible();expect(await page.evaluate(()=>fetch('/api/health').then(()=>true,()=>false))).toBe(false);await context.setOffline(false);
});

test('production worker never persists real Better Auth login/logout or private SSR',async({page,context,baseURL})=>{
 test.skip(!process.env.E2E_BASE_URL,'Real root worker is production-only');
 const {createHmac,randomUUID}=await import('node:crypto');const {default:pg}=await import('pg');
 const pool=new pg.Pool({connectionString:process.env.E2E_DATABASE_URL??process.env.DATABASE_URL??'postgresql://starter:starter@127.0.0.1:5432/starter'});
 const id=`pwa-e2e-${randomUUID()}`,token=randomUUID();
 try{
  await pool.query('INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES ($1,$2,$3,true,now(),now())',[id,'Private PWA fixture',`${id}@example.test`]);
  await pool.query('INSERT INTO "session" (id,user_id,token,expires_at,created_at,updated_at) VALUES ($1,$2,$3,now()+interval \'1 hour\',now(),now())',[randomUUID(),id,token]);
  const secret=process.env.BETTER_AUTH_SECRET??'development-only-secret-change-me-now';const value=encodeURIComponent(`${token}.${createHmac('sha256',secret).update(token).digest('base64')}`);
  await context.addCookies([{name:'better-auth.session_token',value,domain:new URL(baseURL as string).hostname,path:'/',httpOnly:true,sameSite:'Lax'},{name:'__Secure-better-auth.session_token',value,domain:new URL(baseURL as string).hostname,path:'/',httpOnly:true,sameSite:'Lax',secure:true}]);
  await page.goto('/pwa-test');await page.getByRole('button',{name:'Enable offline notice'}).click();await waitForPwa(()=>page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.active),'root native PWA activation');
  await page.goto('/app/projects');await expect(page.getByRole('heading',{name:'Projects',exact:true})).toBeVisible();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const session=await page.evaluate(async()=>await(await fetch('/api/auth/get-session')).json());expect(session.user.id).toBe(id);
  expect(await page.evaluate(async()=>(await fetch('/api/auth/sign-out',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status)).toBe(200);
  expect(await page.evaluate(async()=>await(await fetch('/api/auth/get-session')).json())).toBeNull();
  const cacheURLs=await page.evaluate(async()=>{const result:string[]=[];for(const key of await caches.keys())if(key.startsWith('pwa-offline:'))for(const request of await(await caches.open(key)).keys())result.push(request.url);return result;});expect(cacheURLs).toHaveLength(3);expect(cacheURLs.every(url=>new URL(url).pathname.startsWith('/pwa-offline/'))).toBe(true);
  await context.setOffline(true);expect(await page.evaluate(()=>fetch('/api/auth/get-session').then(()=>true,()=>false))).toBe(false);
  await expect(page.goto('/app/projects')).rejects.toThrow();await context.setOffline(false);
 }finally{await context.setOffline(false);await pool.query('DELETE FROM "user" WHERE id=$1',[id]);await pool.end();}
});
