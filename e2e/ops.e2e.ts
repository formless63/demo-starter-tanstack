import {createHmac,randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import pg from 'pg';
test('Ops requires human operator session on API and SSR; refresh and signout are safe',async({page,context,request,baseURL})=>{
 const pool=new pg.Pool({connectionString:process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgresql://starter:starter@127.0.0.1:5432/starter'});
 const operator='ops-e2e-operator';const ordinary=`ops-e2e-${randomUUID()}`;
 let sessionCookie='';
 const secret=process.env.BETTER_AUTH_SECRET ?? 'development-only-secret-change-me-now';
 async function login(id:string){
  const token=randomUUID();await pool.query('INSERT INTO "session" (id,user_id,token,expires_at,created_at,updated_at) VALUES ($1,$2,$3,now()+interval \'1 hour\',now(),now())',[randomUUID(),id,token]);
  const value=encodeURIComponent(`${token}.${createHmac('sha256',secret).update(token).digest('base64')}`);
  sessionCookie=`${process.env.E2E_BASE_URL ? '__Secure-' : ''}better-auth.session_token=${value}`;
  await context.clearCookies();await context.addCookies([{name:'better-auth.session_token',value,domain:new URL(baseURL as string).hostname,path:'/',httpOnly:true,sameSite:'Lax'},{name:'__Secure-better-auth.session_token',value,domain:new URL(baseURL as string).hostname,path:'/',httpOnly:true,sameSite:'Lax',secure:true}]);
 }
 try{
  for(const id of [operator,ordinary])await pool.query('INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES ($1,$2,$3,true,now(),now())',[id,'Ops fixture',`${id}@example.test`]);
  const denied=await request.get('/api/ops/summary');expect(denied.status()).toBe(401);expect(await denied.json()).toEqual({code:'unauthenticated',message:'Authentication is required.',retryable:false});
  expect(denied.headers()['cache-control']).toBe('private, no-store');expect(denied.headers().vary).toContain('Cookie');
  expect((await request.get('/api/ops/summary',{headers:{'x-api-key':'fixture-nonhuman','x-user-id':operator,'x-organization-role':'owner'}})).status()).toBe(401);
  await login(ordinary);expect((await context.request.get('/api/ops/summary',{headers:{cookie:sessionCookie}})).status()).toBe(403);
  await page.goto('/admin/ops');await expect(page.getByRole('alert')).toHaveText('Operational access is denied.');expect(await page.content()).not.toContain('queued');
  await login(operator);const response=await context.request.get('/api/ops/summary',{headers:{cookie:sessionCookie}});expect(response.status()).toBe(200);
  const summary=await response.json();expect(summary.adapters.length).toBeGreaterThan(0);expect(JSON.stringify(summary)).not.toContain(secret);expect(JSON.stringify(summary)).not.toContain('@example.test');
  await page.goto('/admin/ops');await expect(page.getByRole('heading',{name:'Operational overview'})).toBeVisible();await expect(page.getByText('Last checked:',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Refresh',exact:true}).dblclick();await expect(page.getByRole('button',{name:'Refresh',exact:true})).toBeEnabled();
  await context.clearCookies();await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.getByRole('alert')).toHaveText('Authentication is required.');expect(await page.content()).not.toContain('Jobs cached');
  await page.setViewportSize({width:375,height:700});await page.goto('/admin/ops');await expect(page).toHaveURL(/\/$|\/?redirect=/);
 }finally{await pool.query('DELETE FROM "session" WHERE user_id = ANY($1)',[[operator,ordinary]]);await pool.query('DELETE FROM "user" WHERE id = ANY($1)',[[operator,ordinary]]);await pool.end();}
});
