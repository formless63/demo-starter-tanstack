import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHmac,randomUUID} from 'node:crypto';
import {readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
const id=process.argv[2];assert.ok(['organizations','authorization','feature-flags'].includes(id));const cta=JSON.parse(await readFile('.cta.json','utf8'));assert.equal(cta.projectName,`${id}-addon-clean-install`);assert.ok(resolve(process.cwd()).includes(`${id}-addon-`));
const name=`${id}-lifecycle-${randomUUID()}`;const docker=(...args:string[])=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});let pool:Pool|undefined;
const secret='disposable-lifecycle-secret-at-least-thirty-two-characters';
function run(args:string[],url:string){const result=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,DATABASE_URL:url,BETTER_AUTH_SECRET:secret,APP_BASE_URL:'http://localhost:3000'}});assert.equal(result.status,0,`Fixture command failed: ${args.join(' ')}`);}
try{
 docker('run','-d','--name',name,'-e','POSTGRES_USER=fixture','-e','POSTGRES_PASSWORD=fixture','-e','POSTGRES_DB=fixture','-p','127.0.0.1::5432','public.ecr.aws/docker/library/postgres:18.1-alpine@sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29');const port=docker('port',name,'5432/tcp').trim().split(':').at(-1),url=`postgresql://fixture:fixture@127.0.0.1:${port}/fixture`;pool=new Pool({connectionString:url,connectionTimeoutMillis:1000});for(let i=0;;i++){try{await pool.query('SELECT 1');break;}catch{if(i>=30)throw new Error('Fixture readiness failed');await new Promise(r=>setTimeout(r,200));}}
 await migrate(drizzle(pool),{migrationsFolder:'drizzle'});
 const journal=await readFile('drizzle/meta/_journal.json','utf8');const sqlFiles=(await readdir('drizzle')).filter(f=>f.endsWith('.sql'));const history=await Promise.all(sqlFiles.map(f=>readFile(`drizzle/${f}`,'utf8')));
 await pool.query("CREATE TABLE fixture_personal_project (id text PRIMARY KEY,owner_id text NOT NULL,title text); INSERT INTO fixture_personal_project VALUES ('personal','fixture-user','private')");
 if(id!=='feature-flags'){
  await pool.query(`INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES ('fixture-user','Fixture','fixture@example.test',true,now(),now()); INSERT INTO "session" (id,user_id,token,expires_at,created_at,updated_at) VALUES ('fixture-session','fixture-user','fixture-token',now()+interval '1 day',now(),now())`);
  const cookie=`better-auth.session_token=${encodeURIComponent('fixture-token.'+createHmac('sha256',secret).update('fixture-token').digest('base64'))}`;
  await writeFile('identity-runtime-fixture.ts',`import assert from 'node:assert/strict';import {auth} from './src/lib/auth';import {db} from './src/db';import {sql} from 'drizzle-orm';const headers=new Headers({cookie:${JSON.stringify(cookie)},origin:'http://localhost:3000'});try{const session=await auth.api.getSession({headers});assert.equal(session?.user.id,'fixture-user');const response=await auth.handler(new Request('http://localhost:3000/api/auth/get-session',{headers}));assert.equal(response.status,200);const rows=await db.execute(sql\`SELECT title FROM fixture_personal_project WHERE owner_id='fixture-user'\`);assert.equal(rows.rows[0].title,'private');}finally{await db.$client.end();}process.exit(0);`);
  run(['identity-runtime-fixture.ts'],url);console.log('Personal session/project runtime passed.');
 }
 const table=id==='organizations'?'organization':id==='authorization'?'authorization_assignment':'feature_flag';
 if(id==='organizations')await pool.query("INSERT INTO organization(id,name,slug,created_at) VALUES ('fixture-org','Fixture','fixture-org',now()); INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES ('fixture-owner','fixture-org','fixture-user','owner',now())");
 else if(id==='authorization')await pool.query("INSERT INTO authorization_assignment VALUES ($1,'user','fixture-user','fixture-user','reader',now())",[randomUUID()]);
 else await pool.query("INSERT INTO feature_flag(key,description,enabled,default_value,created_at,updated_at) VALUES ('fixture.flag','fixture',false,false,now(),now())");
 const before=(await pool.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count;
 if(id==='organizations'){
  await writeFile('src/lib/auth.ts',await readFile('capabilities/organizations/test/removal-auth.txt','utf8'));await writeFile('src/lib/auth-client.ts','import {createAuthClient} from \"better-auth/react\";export const authClient=createAuthClient();\n');
  await writeFile('src/db/schema.ts',await readFile('capabilities/organizations/test/removal-schema.txt','utf8'));
 }else if(id==='authorization'){await writeFile('src/db/schema.ts',await readFile('capabilities/authorization/test/removal-schema.txt','utf8'));}
 else await writeFile('src/db/schema.ts','// Capability application removal: committed schema/migrations retained separately.\nexport {};\n');
 for(const file of await readdir(`src/integrations/${id}`))if(file!=='schema.ts')await rm(`src/integrations/${id}/${file}`);
 await rm(`capabilities/${id}/test`,{recursive:true});
 if(id!=='feature-flags')run(['identity-runtime-fixture.ts'],url);console.log('Personal session/project runtime passed.');
 assert.equal((await pool.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count,before);assert.equal(await readFile('drizzle/meta/_journal.json','utf8'),journal);assert.deepEqual(await Promise.all(sqlFiles.map(f=>readFile(`drizzle/${f}`,'utf8'))),history);
 run(['x','tsc','--noEmit'],url);run(['run','build'],url);await rm('identity-runtime-fixture.ts',{force:true});
 console.log(`${id}: runtime removal/rebuild preserves tables, personal fixture and exact migration history.`);
}finally{await pool?.end();try{docker('rm','-f',name);}catch{}}
