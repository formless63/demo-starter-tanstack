import {createHmac,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
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
 }finally{await client.end();}
}finally{await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);await admin.end();}
