import {readFile,readdir} from "node:fs/promises";
import {fromCrossJSON,toJSON} from "seroval";
import {createHmac,randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {Pool} from 'pg';
import {request as nativeHttpRequest} from "node:http";
import {drizzle} from 'drizzle-orm/node-postgres';
import {defineFeatureFlags} from '../src/integrations/feature-flags/feature-flags.server';

test('tenant selection preserves personal ownership, denies member writes and projects private boolean flags',async({page,context,request,baseURL})=>{
 test.setTimeout(60000);const pool=new Pool({connectionString:process.env.DATABASE_URL}),suffix=randomUUID(),owner=`identity-owner-${suffix}`,member=`identity-member-${suffix}`,other=`identity-other-${suffix}`,tenantA=`tenant-a-${suffix}`,tenantB=`tenant-b-${suffix}`,noteA=randomUUID(),noteB=randomUUID(),token=randomUUID(),secret=process.env.BETTER_AUTH_SECRET!;
 const signed=encodeURIComponent(`${token}.${createHmac('sha256',secret).update(token).digest('base64')}`),cookie=`${process.env.E2E_BASE_URL?'__Secure-':''}better-auth.session_token=${signed}`;
 const flags=defineFeatureFlags({managementGuard:actor=>actor.authority==='operator'}),db=drizzle(pool),operator={userId:`operator-${suffix}`,authority:'operator' as const};
 let createdFlag=false;
 try{
  await pool.query('INSERT INTO "user" (id,name,email,email_verified) VALUES ($1,\'Identity owner\',$1||\'@example.test\',true),($2,\'Identity member\',$2||\'@example.test\',true),($3,\'Identity other\',$3||\'@example.test\',true)',[owner,member,other]);
  await pool.query('INSERT INTO "session" (id,user_id,token,expires_at,active_organization_id) VALUES ($1,$2,$3,now()+interval \'1 hour\',$4)',[randomUUID(),owner,token,tenantA]);
  await pool.query('INSERT INTO organization (id,name,slug,created_at) VALUES ($1,\'Identity Alpha\',$1,now()),($2,\'Identity Beta\',$2,now())',[tenantA,tenantB]);
  await pool.query('INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,\'owner\',now()),($4,$2,$5,\'member\',now()),($6,$7,$3,\'member\',now()),($8,$7,$9,\'owner\',now())',[randomUUID(),tenantA,owner,randomUUID(),member,randomUUID(),tenantB,randomUUID(),other]);
  await pool.query('INSERT INTO project (id,owner_id,name) VALUES ($1,$2,\'Identity personal project\'),($3,$4,\'Foreign private project\')',[randomUUID(),owner,randomUUID(),other]);
  await pool.query('INSERT INTO organization_note (id,organization_id,title) VALUES ($1,$2,\'Alpha private note\'),($3,$4,\'Beta shared note\')',[noteA,tenantA,noteB,tenantB]);
  expect((await request.get('/api/flags')).status()).toBe(401);
  const existing=await pool.query("SELECT key FROM feature_flag WHERE key='beta.dashboard'");expect(existing.rowCount,'Disposable fixture requires no existing demonstration definition').toBe(0);
  let flag=await flags.createDefinition(db,operator,{key:'beta.dashboard',description:'Explicit browser fixture',enabled:false,defaultValue:true});createdFlag=true;
  await context.addCookies([{name:'better-auth.session_token',value:signed,domain:new URL(baseURL!).hostname,path:'/',httpOnly:true,sameSite:'Lax'},{name:'__Secure-better-auth.session_token',value:signed,domain:new URL(baseURL!).hostname,path:'/',httpOnly:true,sameSite:'Lax',secure:true}]);
  await page.goto('/app/projects');await expect(page.getByRole('heading',{name:'Projects',exact:true})).toBeVisible();await expect(page.getByText('Identity personal project',{exact:true})).toBeVisible();await expect(page.getByText('Foreign private project',{exact:true})).toHaveCount(0);await expect(page.getByRole('complementary',{name:'Beta dashboard'})).toHaveCount(0);
  flag=await flags.updateDefinition(db,operator,{key:flag.key,expectedRevision:flag.revision,enabled:true});await page.reload();await expect(page.getByRole('complementary',{name:'Beta dashboard'})).toBeVisible();
  const projection=await request.get('/api/flags',{headers:{Cookie:cookie}});expect(projection.headers()['cache-control']).toBe('private, no-store');expect(await projection.json()).toEqual({'beta.dashboard':true});
  flag=await flags.setOverride(db,operator,{key:flag.key,expectedRevision:flag.revision,targetKind:'tenant',targetId:tenantB,value:false});

  const nativeId=async(name:string)=>{if(process.env.E2E_BASE_URL){for(const file of await readdir('.output/server/_ssr')){if(!file.startsWith('organizations.functions-'))continue;const source=await readFile(`.output/server/_ssr/${file}`,'utf8');const found=[...source.matchAll(/id: "([^"]+)",\s*name: "([^"]+)"/g)].find(match=>match[2]===name)?.[1];if(found)return found;}}else{const source=await(await request.get('/src/features/organizations/organizations.functions.ts')).text();const found=/createClientRpc\("([^"]+)"/.exec(source.slice(source.indexOf(`export const ${name}`)))?.[1];if(found)return found;}throw new Error('Native tenant action missing');};
  const ids=Object.fromEntries(await Promise.all(['getOrganizationNote','updateOrganizationNote','deleteOrganizationNote','addOrganizationNote'].map(async name=>[name,await nativeId(name)])));
  const call=async(name:string,data:unknown)=>request.post(`/_serverFn/${ids[name]}`,{headers:{'Content-Type':'application/json','x-tsr-serverFn':'true',Origin:baseURL!,Cookie:cookie},data:JSON.stringify(toJSON({data,context:{}}))});
  const ownNote=fromCrossJSON(await(await call('getOrganizationNote',{organizationId:tenantA,id:noteA})).json(),{refs:new Map()}) as {result:{title:string}};expect(ownNote.result.title).toBe('Alpha private note');
  if(!process.env.E2E_BASE_URL){
   // Exercise actual incomplete POST-body cancellation, not a mocked abort error.
   for(let i=0;i<3;i++)await new Promise<void>(resolve=>{const upload=nativeHttpRequest(new URL(`/_serverFn/${ids.getOrganizationNote}`,baseURL),{method:'POST',headers:{'Content-Type':'application/json','Content-Length':'100000','x-tsr-serverFn':'true',Origin:baseURL!,Cookie:cookie}});upload.on('error',()=>resolve());upload.on('close',()=>resolve());upload.write('{"data":');setTimeout(()=>upload.destroy(),100);});
   expect((await request.get('/api/health')).status()).toBe(200);
  }

  for(const name of ['getOrganizationNote','updateOrganizationNote','deleteOrganizationNote']){const response=await call(name,{organizationId:tenantA,id:noteB,title:'Denied cross-tenant'});const body=await response.text();expect(body).toContain('Organization resource was not found.');expect(body).not.toContain('Beta shared note');expect(body).not.toMatch(/SELECT |postgresql|fixture-operator|organization_note/);}
  const spoofed=await request.get(`/api/flags?tenantId=${tenantB}&keys=private.flag`,{headers:{Cookie:cookie,'X-Organization-ID':tenantB}});expect(await spoofed.json()).toEqual({'beta.dashboard':true});
  await page.getByRole('link',{name:'Organizations',exact:true}).click();await expect(page.getByText('Alpha private note',{exact:true})).toBeVisible();await page.getByLabel('Note title',{exact:true}).fill('Created through authorized tenant action');await page.getByRole('button',{name:'Add note',exact:true}).click();await expect(page.getByText('Created through authorized tenant action',{exact:true})).toBeVisible();
  await page.getByLabel('Active organization').selectOption(tenantB);await expect(page.getByText('Beta shared note',{exact:true})).toBeVisible();await expect(page.getByText('Alpha private note',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Note title',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Delete note',exact:true})).toHaveCount(0);

  flag=await flags.setOverride(db,operator,{key:flag.key,expectedRevision:flag.revision,targetKind:'tenant',targetId:tenantB,value:true});expect(await(await request.get('/api/flags',{headers:{Cookie:cookie}})).json()).toEqual({'beta.dashboard':true});
  for(const name of ['updateOrganizationNote','deleteOrganizationNote','addOrganizationNote']){const response=await call(name,{organizationId:tenantB,id:noteB,title:'Denied member write',userId:other,role:'owner'});const body=await response.text();expect(body).toContain('Organization operation is forbidden.');expect(body).not.toMatch(/SELECT |postgresql|organization_note/);}
  flag=await flags.setOverride(db,operator,{key:flag.key,expectedRevision:flag.revision,targetKind:'tenant',targetId:tenantB,value:false});
  await page.getByRole('link',{name:'Projects',exact:true}).click();await expect(page.getByText('Identity personal project',{exact:true})).toBeVisible();await expect(page.getByRole('complementary',{name:'Beta dashboard'})).toHaveCount(0);await expect(page.getByText('Foreign private project',{exact:true})).toHaveCount(0);
  // Delay a real Alpha projection, switch tenants, then release the old response.
  await page.getByRole('link',{name:'Organizations',exact:true}).click();await page.getByLabel('Active organization').selectOption(tenantA);await expect(page.getByText('Alpha private note',{exact:true})).toBeVisible();
  let entered!:()=>void,release!:()=>void,finished!:()=>void,aborted!:()=>void;const firstRead=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r),oldFinished=new Promise<void>(r=>finished=r),requestAborted=new Promise<void>(r=>aborted=r);let firstRequest:import('@playwright/test').Request|undefined,interceptions=0;
  const onFailure=(failed:import('@playwright/test').Request)=>{if(failed===firstRequest){expect(failed.failure()?.errorText).toMatch(/abort|cancel/i);aborted();}};page.on('requestfailed',onFailure);
  const intercept=async(route:import('@playwright/test').Route)=>{if(interceptions++===0){firstRequest=route.request();const response=await route.fetch();expect(await response.json()).toEqual({'beta.dashboard':true});entered();await gate;try{await route.fulfill({response});}catch{/* Native fetch was aborted on unmount. */}finally{finished();}}else await route.continue();};
  await page.route('**/api/flags',intercept);
  try{
   await page.getByRole('link',{name:'Projects',exact:true}).click();await firstRead;
   await page.getByRole('link',{name:'Organizations',exact:true}).click();await requestAborted;await page.getByLabel('Active organization').selectOption(tenantB);await expect(page.getByText('Beta shared note',{exact:true})).toBeVisible();
   const fresh=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/flags');await page.getByRole('link',{name:'Projects',exact:true}).click();expect(await(await fresh).json()).toEqual({'beta.dashboard':false});release();await oldFinished;await expect(page.getByRole('complementary',{name:'Beta dashboard'})).toHaveCount(0);
  }finally{release();await page.unroute('**/api/flags',intercept);page.off('requestfailed',onFailure);}
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await pool.query('DELETE FROM member WHERE organization_id=$1 AND user_id=$2',[tenantB,owner]);await page.getByRole('link',{name:'Organizations',exact:true}).click();await expect(page.getByText('Beta shared note',{exact:true})).toHaveCount(0);const stale=await request.get('/api/flags',{headers:{Cookie:cookie}});expect(await stale.json()).toEqual({'beta.dashboard':false});
 }finally{
  if(createdFlag){await pool.query("DELETE FROM feature_flag_override WHERE flag_key='beta.dashboard'");await pool.query("DELETE FROM feature_flag WHERE key='beta.dashboard'");}
  await pool.query('DELETE FROM organization_note WHERE organization_id=ANY($1::text[])',[[tenantA,tenantB]]);await pool.query('DELETE FROM invitation WHERE organization_id=ANY($1::text[])',[[tenantA,tenantB]]);await pool.query('DELETE FROM member WHERE organization_id=ANY($1::text[])',[[tenantA,tenantB]]);await pool.query('DELETE FROM organization WHERE id=ANY($1::text[])',[[tenantA,tenantB]]);await pool.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[[owner,member,other]]);await pool.end();
 }
});
