import { createHmac, randomUUID } from 'node:crypto';
import { expect,test } from '@playwright/test';
import pg from 'pg';
test('personal transfer UI enforces session ownership and safe expired/cancel outcomes without optional providers',async({page,context,request,baseURL})=>{
 const pool=new pg.Pool({connectionString:process.env.E2E_DATABASE_URL??process.env.DATABASE_URL});const owner=`transfer-e2e-${randomUUID()}`;const other=`transfer-e2e-${randomUUID()}`;const token=randomUUID();const ids=[randomUUID(),randomUUID(),randomUUID()];
 try {
  expect((await request.post('/api/transfers-stage',{data:'private-csv-cell'})).status()).toBe(401);
  await pool.query('INSERT INTO "user"(id,name,email) VALUES($1,$1,$1||\'@example.test\'),($2,$2,$2||\'@example.test\')',[owner,other]);
  await pool.query('INSERT INTO session(id,user_id,token,expires_at) VALUES($1,$2,$3,now()+interval \'1 hour\')',[randomUUID(),owner,token]);
  for(let i=0;i<ids.length;i++)await pool.query("INSERT INTO import_export_transfer(id,requester_id,scope_kind,scope_id,definition,version,direction,status,created_at,updated_at,artifact_expires_at,source_key) VALUES($1,$2,'user',$2,'projects','1','import','staged',now(),now(),now()-interval '1 day','private-object-pointer')",[ids[i],i===2?other:owner]);
  const signature=createHmac('sha256',process.env.BETTER_AUTH_SECRET??'development-only-secret-change-me-now').update(token).digest('base64');
  for(const name of ['better-auth.session_token','__Secure-better-auth.session_token'])await context.addCookies([{name,value:encodeURIComponent(`${token}.${signature}`),domain:new URL(baseURL!).hostname,path:'/',httpOnly:true,sameSite:'Lax',secure:name.startsWith('__Secure-')}]);
  await page.goto('/app/transfers');await expect(page.getByRole('heading',{name:'Import / Export Projects'})).toBeVisible();await expect(page.getByRole('button',{name:'Start import'})).toHaveCount(2);
  await expect(page.getByText('private-object-pointer')).toHaveCount(0);
  await page.getByRole('button',{name:'Start import'}).first().click();await expect(page.getByRole('status')).toContainText('Transfer artifact has expired');
  await page.getByRole('button',{name:'Cancel transfer'}).first().click();await expect(page.getByRole('button',{name:'Cancel transfer'})).toHaveCount(1);
  expect((await pool.query("SELECT count(*)::integer AS count FROM import_export_transfer WHERE requester_id=$1 AND status='cancelled'",[owner])).rows[0].count).toBe(1);
  await expect(page.getByLabel('Project CSV')).toBeVisible();await expect(page.getByRole('button',{name:'Upload CSV'})).toBeDisabled();await expect(page.getByRole('button',{name:'Export Projects'})).toBeVisible();
 } finally {await pool.query('DELETE FROM import_export_transfer WHERE id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[[owner,other]]);await pool.end();}
});
