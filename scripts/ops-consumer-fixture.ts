import {createHmac,randomUUID} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdirSync,writeFileSync} from 'node:fs';
import pg from 'pg';
import {readFileSync} from 'node:fs';
if(!process.cwd().includes('ops-addon-clean-install'))throw new Error('Disposable consumer required');
if(JSON.parse(readFileSync('node_modules/better-auth/package.json','utf8')).version !== '1.7.7')throw new Error('Baseline Better Auth version mismatch');
const adminUrl=process.env.DATABASE_URL!;const admin=new pg.Client({connectionString:adminUrl});await admin.connect();
const database=`ops_fixture_${randomUUID().replaceAll('-','')}`;
try{
 await admin.query(`CREATE DATABASE "${database}"`);
 const url=new URL(adminUrl);url.pathname=`/${database}`;process.env.DATABASE_URL=url.toString();
 process.env.BETTER_AUTH_SECRET='ops-consumer-fixture-secret-with-at-least-32-characters';process.env.APP_BASE_URL='http://localhost:3000';
 for(const args of [['x','drizzle-kit','generate'],['x','drizzle-kit','migrate']]){const run=spawnSync('bun',args,{stdio:'inherit',env:process.env});if(run.status!==0)throw new Error('Baseline explicit migration failed');}
 const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try{
  const userId=`opaque-${randomUUID()}`;const token=randomUUID();
  await client.query('INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES ($1,$2,$3,true,now(),now())',[userId,'Fixture',`${userId}@example.test`]);
  await client.query('INSERT INTO "session" (id,user_id,token,expires_at,created_at,updated_at) VALUES ($1,$2,$3,now()+interval \'1 hour\',now(),now())',[randomUUID(),userId,token]);
  const {opsResponse}=await import('../src/lib/ops.server');
  const cookie=`better-auth.session_token=${encodeURIComponent(`${token}.${createHmac('sha256',process.env.BETTER_AUTH_SECRET).update(token).digest('base64')}`)}`;
  const call=()=>opsResponse(new Request('http://localhost:3000/api/ops/summary',{headers:{cookie}}));
  if((await opsResponse(new Request('http://localhost:3000/api/ops/summary',{headers:{'x-api-key':'nonhuman'}}))).status!==401)throw new Error('Machine boundary failed');
  process.env.OPS_ADMIN_USER_IDS='';if((await call()).status!==403)throw new Error('Default deny failed');
  process.env.OPS_ADMIN_USER_IDS=userId;const allowed=await call();const summary=await allowed.json();if(allowed.status!==200||summary.adapters.length!==0)throw new Error('Baseline-only operator failed');
  process.env.OPS_ADMIN_USER_IDS='bad\u0000';if((await call()).status!==503)throw new Error('Malformed configuration failed open');
  console.info('Baseline-only human session/operator/API-key boundaries and empty registry runtime passed');
  // Fixture-only baseline health route; not shipped as Ops runtime or migration.
  mkdirSync('src/routes/api',{recursive:true});
  writeFileSync('src/routes/api/health.ts',`import {createFileRoute} from '@tanstack/react-router';import {sql} from 'drizzle-orm';import {db} from '#/db';export const Route=createFileRoute('/api/health')({server:{handlers:{GET:async()=>{await db.execute(sql\`select 1\`);return Response.json({status:'ok'});}}}});`);
  const removed=spawnSync('bun',['scripts/ops-removal-fixture.ts'],{stdio:'inherit',env:process.env});if(removed.status!==0)throw new Error('Ops code removal failed');
  const portServer=createServer();await new Promise<void>(resolve=>portServer.listen(0,'127.0.0.1',resolve));const address=portServer.address();if(!address||typeof address==='string')throw new Error();await new Promise<void>(resolve=>portServer.close(()=>resolve()));
  const base=`http://127.0.0.1:${address.port}`;
  const child=spawn('bun',['run','dev','--','--port',String(address.port)],{stdio:'ignore',detached:true,env:{...process.env,NODE_ENV:'development',APP_BASE_URL:base}});
  try{
   const deadline=Date.now()+30000;let ready=false;
   while(Date.now()<deadline){try{if((await fetch(`${base}/api/health`)).status===200){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
   if(!ready)throw new Error('Removed consumer failed baseline health');
   for(const path of ['/api/ops/summary','/admin/ops'])if((await fetch(base+path)).status!==404)throw new Error('Ops route survived removal');
   const restored=await fetch(`${base}/api/auth/get-session`,{headers:{cookie}});if(restored.status!==200||(await restored.json()).user?.id!==userId)throw new Error('Human login/session failed after Ops removal');
   const row=await client.query('SELECT id FROM "user" WHERE id=$1',[userId]);if(row.rows.length!==1)throw new Error('Removal altered baseline persistent identity');
   console.info('Post-Ops-removal routes 404, baseline human login/session and database health passed; identity retained');
  }finally{if(child.pid){const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));try{process.kill(-child.pid,'SIGTERM');}catch{}await exited;}}
  const {db}=await import('../src/db');await db.$client.end();
 }finally{await client.end();}
}finally{await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);await admin.end();}
