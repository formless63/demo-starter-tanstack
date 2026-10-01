import {createHmac,randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {defineFeatureFlags} from '../src/integrations/feature-flags/feature-flags.server';

test('tenant selection preserves personal ownership, denies member writes and projects private boolean flags',async({page,context,request,baseURL})=>{
 test.setTimeout(60000);const pool=new Pool({connectionString:process.env.DATABASE_URL}),suffix=randomUUID(),owner=`identity-owner-${suffix}`,member=`identity-member-${suffix}`,other=`identity-other-${suffix}`,tenantA=`tenant-a-${suffix}`,tenantB=`tenant-b-${suffix}`,token=randomUUID(),secret=process.env.BETTER_AUTH_SECRET!;
 const signed=encodeURIComponent(`${token}.${createHmac('sha256',secret).update(token).digest('base64')}`),cookie=`${process.env.E2E_BASE_URL?'__Secure-':''}better-auth.session_token=${signed}`;
 const flags=defineFeatureFlags({managementGuard:actor=>actor.authority==='operator'}),db=drizzle(pool),operator={userId:`operator-${suffix}`,authority:'operator' as const};
 let createdFlag=false;
 try{
  await pool.query('INSERT INTO "user" (id,name,email,email_verified) VALUES ($1,\'Identity owner\',$1||\'@example.test\',true),($2,\'Identity member\',$2||\'@example.test\',true),($3,\'Identity other\',$3||\'@example.test\',true)',[owner,member,other]);
  await pool.query('INSERT INTO "session" (id,user_id,token,expires_at,active_organization_id) VALUES ($1,$2,$3,now()+interval \'1 hour\',$4)',[randomUUID(),owner,token,tenantA]);
  await pool.query('INSERT INTO organization (id,name,slug,created_at) VALUES ($1,\'Identity Alpha\',$1,now()),($2,\'Identity Beta\',$2,now())',[tenantA,tenantB]);
  await pool.query('INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,\'owner\',now()),($4,$2,$5,\'member\',now()),($6,$7,$3,\'member\',now()),($8,$7,$9,\'owner\',now())',[randomUUID(),tenantA,owner,randomUUID(),member,randomUUID(),tenantB,randomUUID(),other]);
  await pool.query('INSERT INTO project (id,owner_id,name) VALUES ($1,$2,\'Identity personal project\'),($3,$4,\'Foreign private project\')',[randomUUID(),owner,randomUUID(),other]);
  await pool.query('INSERT INTO organization_note (id,organization_id,title) VALUES ($1,$2,\'Alpha private note\'),($3,$4,\'Beta shared note\')',[randomUUID(),tenantA,randomUUID(),tenantB]);
  expect((await request.get('/api/flags')).status()).toBe(401);
  const existing=await pool.query("SELECT key FROM feature_flag WHERE key='beta.dashboard'");expect(existing.rowCount,'Disposable fixture requires no existing demonstration definition').toBe(0);
  let flag=await flags.createDefinition(db,operator,{key:'beta.dashboard',description:'Explicit browser fixture',enabled:false,defaultValue:true});createdFlag=true;
  await context.addCookies([{name:'better-auth.session_token',value:signed,domain:new URL(baseURL!).hostname,path:'/',httpOnly:true,sameSite:'Lax'},{name:'__Secure-better-auth.session_token',value:signed,domain:new URL(baseURL!).hostname,path:'/',httpOnly:true,sameSite:'Lax',secure:true}]);
  await page.goto('/app/projects');await expect(page.getByRole('heading',{name:'Projects',exact:true})).toBeVisible();await expect(page.getByText('Identity personal project',{exact:true})).toBeVisible();await expect(page.getByText('Foreign private project',{exact:true})).toHaveCount(0);await expect(page.getByRole('complementary',{name:'Beta dashboard'})).toHaveCount(0);
  flag=await flags.updateDefinition(db,operator,{key:flag.key,expectedRevision:flag.revision,enabled:true});await page.reload();await expect(page.getByRole('complementary',{name:'Beta dashboard'})).toBeVisible();
  const projection=await request.get('/api/flags',{headers:{Cookie:cookie}});expect(projection.headers()['cache-control']).toBe('private, no-store');expect(await projection.json()).toEqual({'beta.dashboard':true});
  flag=await flags.setOverride(db,operator,{key:flag.key,expectedRevision:flag.revision,targetKind:'tenant',targetId:tenantB,value:false});
  await page.getByRole('link',{name:'Organizations',exact:true}).click();await expect(page.getByText('Alpha private note',{exact:true})).toBeVisible();await page.getByLabel('Note title',{exact:true}).fill('Created through authorized tenant action');await page.getByRole('button',{name:'Add note',exact:true}).click();await expect(page.getByText('Created through authorized tenant action',{exact:true})).toBeVisible();
  await page.getByLabel('Active organization').selectOption(tenantB);await expect(page.getByText('Beta shared note',{exact:true})).toBeVisible();await expect(page.getByText('Alpha private note',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Note title',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Delete note',exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:'Projects',exact:true}).click();await expect(page.getByText('Identity personal project',{exact:true})).toBeVisible();await expect(page.getByRole('complementary',{name:'Beta dashboard'})).toHaveCount(0);await expect(page.getByText('Foreign private project',{exact:true})).toHaveCount(0);
  await pool.query('DELETE FROM member WHERE organization_id=$1 AND user_id=$2',[tenantB,owner]);await page.getByRole('link',{name:'Organizations',exact:true}).click();await expect(page.getByText('Beta shared note',{exact:true})).toHaveCount(0);const stale=await request.get('/api/flags',{headers:{Cookie:cookie}});expect(await stale.json()).toEqual({'beta.dashboard':false});
 }finally{
  if(createdFlag){await pool.query("DELETE FROM feature_flag_override WHERE flag_key='beta.dashboard'");await pool.query("DELETE FROM feature_flag WHERE key='beta.dashboard'");}
  await pool.query('DELETE FROM organization_note WHERE organization_id=ANY($1::text[])',[[tenantA,tenantB]]);await pool.query('DELETE FROM invitation WHERE organization_id=ANY($1::text[])',[[tenantA,tenantB]]);await pool.query('DELETE FROM member WHERE organization_id=ANY($1::text[])',[[tenantA,tenantB]]);await pool.query('DELETE FROM organization WHERE id=ANY($1::text[])',[[tenantA,tenantB]]);await pool.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[[owner,member,other]]);await pool.end();
 }
});
