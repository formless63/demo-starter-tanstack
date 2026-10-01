import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHmac,randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {betterAuth} from "better-auth";
import {drizzleAdapter} from "better-auth/adapters/drizzle";
import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import * as baseline from "./auth-schema";
import * as tables from "../../../src/integrations/organizations/schema";
import {defineOrganizations} from "../../../src/integrations/organizations/auth.server";
import {resolveTenantContext,listOwnOrganizations,diagnoseOrganizationAdmission} from "../../../src/integrations/organizations/organizations.server";
import {organizationConfig,organizationName,organizationSlug,pageInput,encodeCursor} from "../../../src/integrations/organizations/validation";

const fixtureName=`organizations-contract-${randomUUID()}`;
const docker=(...args:string[])=>execFileSync("docker",args,{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
let pool:Pool|undefined;
const secret="disposable-organization-test-secret-at-least-thirty-two-characters";
try{
 docker("run","-d","--name",fixtureName,"-e","POSTGRES_USER=fixture","-e","POSTGRES_PASSWORD=fixture","-e","POSTGRES_DB=fixture","-p","127.0.0.1::5432","public.ecr.aws/docker/library/postgres:18.1-alpine@sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29");
 const port=docker("port",fixtureName,"5432/tcp").trim().split(":").at(-1);
 pool=new Pool({connectionString:`postgresql://fixture:fixture@127.0.0.1:${port}/fixture`,options:"-c statement_timeout=5000 -c lock_timeout=2000",connectionTimeoutMillis:1000});
 for(let i=0;;i++){try{await pool.query("SELECT 1");break;}catch{if(i>=30)throw new Error("Fixture readiness failed");await new Promise(r=>setTimeout(r,200));}}
	await pool.query(`
 CREATE TABLE "user" (id text PRIMARY KEY,name text,email text,email_verified boolean,image text,created_at timestamptz,updated_at timestamptz);
 CREATE TABLE "session" (id text PRIMARY KEY,user_id text,token text,expires_at timestamptz,created_at timestamptz,updated_at timestamptz,ip_address text,user_agent text,active_organization_id text);
 CREATE TABLE account (id text PRIMARY KEY,account_id text,provider_id text,user_id text,access_token text,refresh_token text,id_token text,access_token_expires_at timestamptz,refresh_token_expires_at timestamptz,scope text,password text,created_at timestamptz,updated_at timestamptz);
 CREATE TABLE verification (id text PRIMARY KEY,identifier text,value text,expires_at timestamptz,created_at timestamptz,updated_at timestamptz);
`);
 await pool.query(await readFile("capabilities/organizations/test/schema.sql","utf8"));
 const db=drizzle(pool,{schema:{...baseline,...tables}});
 const organizations=defineOrganizations({ORGANIZATIONS_MEMBERSHIP_LIMIT:"10"});
 const auth=betterAuth({baseURL:"http://localhost:3000",secret,database:drizzleAdapter(db,{provider:"pg",transaction:true}),logger:{disabled:true},plugins:[organizations.plugin],hooks:{before:organizations.before,after:organizations.after},onAPIError:organizations.onAPIError});
 const headers=(id:string)=>{const token=`token-${id}`;return new Headers({origin:"http://localhost:3000",cookie:`better-auth.session_token=${encodeURIComponent(`${token}.${createHmac("sha256",secret).update(token).digest("base64")}`)}`});};
 for(const id of ["owner","admin","member","recipient","other","unverified"]){await pool.query('INSERT INTO "user" VALUES ($1,$1,$2,$3,null,now(),now())',[id,`${id}@example.test`,id!=="unverified"]);await pool.query('INSERT INTO "session" VALUES ($1,$2,$3,now()+interval \'1 day\',now(),now(),null,null,null)',[`session-${id}`,id,`token-${id}`]);}
 const routes:Record<string,string>={createOrganization:"create",updateOrganization:"update",inviteMember:"invite-member",acceptInvitation:"accept-invitation",rejectInvitation:"reject-invitation",cancelInvitation:"cancel-invitation",removeMember:"remove-member",updateMemberRole:"update-member-role",leaveOrganization:"leave",setActiveOrganization:"set-active",deleteOrganization:"delete"};
 const call=async(method:string,body:Record<string,unknown>,id="owner",http=false)=>{
  if(http){const response=await auth.handler(new Request(`http://localhost:3000/api/auth/organization/${routes[method]}`,{method:"POST",headers:new Headers([...headers(id),["content-type","application/json"]]),body:JSON.stringify(body)}));if(!response.ok){const safe=await response.json() as {code:string;message:string};throw Object.assign(new Error(safe.message),{code:safe.code});}return response.json();}
  const fn=Reflect.get(auth.api,method==="inviteMember"?"createInvitation":method) as (input:{headers:Headers;body:Record<string,unknown>})=>Promise<Record<string,unknown>>;
  return fn({headers:headers(id),body});
 };
 const forbidden=async(method:string,body:Record<string,unknown>,id="owner")=>{for(const http of [false,true])await assert.rejects(call(method,body,id,http));};
 const created=await call("createOrganization",{name:"  Alpha  ",slug:"  ALPHA-ORG  "});const id=String(created.id);
 assert.equal(created.name,"Alpha");assert.equal(created.slug,"alpha-org");
 assert.equal((await resolveTenantContext({id:"owner"},id,db)).role,"owner");
 await forbidden("leaveOrganization",{organizationId:id});await forbidden("deleteOrganization",{organizationId:id});
 const own=await pool.query("SELECT id FROM member WHERE organization_id=$1",[id]);const ownerMembership=own.rows[0].id;
 await forbidden("updateMemberRole",{organizationId:id,memberId:ownerMembership,role:"member"});
 await forbidden("removeMember",{organizationId:id,memberIdOrEmail:ownerMembership});
 await forbidden("inviteMember",{organizationId:id,email:"recipient@example.test",role:"owner"});
 await forbidden("inviteMember",{organizationId:id,email:"recipient@example.test",role:"member,owner"});
 await forbidden("createOrganization",{name:"Alpha duplicate",slug:"alpha-org"});
 await forbidden("createOrganization",{name:"Another",slug:"another",userId:"other"});
 await assert.rejects(auth.api.addMember({headers:headers("owner"),body:{organizationId:id,userId:"other",role:"owner"}}));
 for(const role of ["admin","member"]){const invite=await call("inviteMember",{organizationId:id,email:`${role}@example.test`,role});await call("acceptInvitation",{invitationId:invite.id},role);}
 const adminMembership=(await pool.query("SELECT id FROM member WHERE organization_id=$1 AND user_id='admin'",[id])).rows[0].id;
 await forbidden("inviteMember",{organizationId:id,email:"recipient@example.test",role:"admin"},"admin");
 await forbidden("updateMemberRole",{organizationId:id,memberId:adminMembership,role:"admin"},"admin");
 await forbidden("removeMember",{organizationId:id,memberIdOrEmail:ownerMembership},"admin");
 await forbidden("updateOrganization",{organizationId:id,data:{name:"Changed"}},"admin");
 const invited=await call("inviteMember",{organizationId:id,email:"  RECIPIENT@example.test  "});
 await forbidden("acceptInvitation",{invitationId:invited.id},"other");
 const accepted=await Promise.allSettled([call("acceptInvitation",{invitationId:invited.id},"recipient"),call("acceptInvitation",{invitationId:invited.id},"recipient",true)]);
 assert.equal(accepted.filter(r=>r.status==="fulfilled").length,1);assert.equal((await pool.query("SELECT count(*)::int AS count FROM member WHERE organization_id=$1 AND user_id='recipient'",[id])).rows[0].count,1);
 const unverified=await call("inviteMember",{organizationId:id,email:"unverified@example.test"});await forbidden("acceptInvitation",{invitationId:unverified.id},"unverified");
 const cancelled=await call("inviteMember",{organizationId:id,email:"other@example.test"});await call("cancelInvitation",{invitationId:cancelled.id});await call("cancelInvitation",{invitationId:cancelled.id},"owner",true);await forbidden("acceptInvitation",{invitationId:cancelled.id},"other");
 const rejected=await call("inviteMember",{organizationId:id,email:"other@example.test"});await call("rejectInvitation",{invitationId:rejected.id},"other");await call("rejectInvitation",{invitationId:rejected.id},"other",true);await forbidden("acceptInvitation",{invitationId:rejected.id},"other");
 const expiring=await call("inviteMember",{organizationId:id,email:"other@example.test"});await pool.query("UPDATE invitation SET expires_at=now() WHERE id=$1",[expiring.id]);await forbidden("acceptInvitation",{invitationId:expiring.id},"other");
 const malformed=await call("inviteMember",{organizationId:id,email:"other@example.test",resend:true});await pool.query("UPDATE invitation SET role='owner,member' WHERE id=$1",[malformed.id]);await forbidden("acceptInvitation",{invitationId:malformed.id},"other");await forbidden("inviteMember",{organizationId:id,email:"other@example.test",resend:true});
 const retained=await pool.query("SELECT id FROM member WHERE organization_id=$1 AND user_id='recipient'",[id]);await call("removeMember",{organizationId:id,memberIdOrEmail:retained.rows[0].id});
 await assert.rejects(resolveTenantContext({id:"recipient"},id,db));await assert.rejects(resolveTenantContext({id:"other"},id,db));
 const second=await call("createOrganization",{name:"Second",slug:"second-org"},"other",true);
 const parallel=await Promise.all([resolveTenantContext({id:"owner"},id,db),resolveTenantContext({id:"other"},String(second.id),db)]);assert.notEqual(parallel[0].scope.id,parallel[1].scope.id);
 assert.equal((await listOwnOrganizations({id:"owner"},db,{limit:1})).items.length,1);
 const failureInvite=await call("inviteMember",{organizationId:id,email:"recipient@example.test"});
 await pool.query("CREATE FUNCTION fail_fixture_member() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture-only failure'; END $$; CREATE TRIGGER fail_fixture_member BEFORE INSERT ON member FOR EACH ROW EXECUTE FUNCTION fail_fixture_member()");
 for(const http of [false,true]){await assert.rejects(call("acceptInvitation",{invitationId:failureInvite.id},"recipient",http));assert.equal((await pool.query("SELECT status FROM invitation WHERE id=$1",[failureInvite.id])).rows[0].status,"pending");}
 await pool.query("DROP TRIGGER fail_fixture_member ON member; DROP FUNCTION fail_fixture_member()");
 // Inject the documented interruption state. This is a deliberate state fixture,
 // not a claim to have killed an actual process in the acceptance window.
 await pool.query("UPDATE invitation SET status='accepted' WHERE id=$1",[failureInvite.id]);
 await assert.rejects(resolveTenantContext({id:"recipient"},id,db));await forbidden("acceptInvitation",{invitationId:failureInvite.id},"recipient");
 const diagnostic=await diagnoseOrganizationAdmission(db,{kind:"operator"},id);assert.ok(diagnostic.acceptedWithoutMembership.some(row=>row.invitationId===failureInvite.id));
 assert.equal(organizationConfig({}).creationLimit,10);for(const bad of ["01","1.5","-1","101"," "]){assert.throws(()=>organizationConfig({ORGANIZATIONS_CREATION_LIMIT:bad}));}
 assert.equal(organizationName("a".repeat(100)).length,100);assert.throws(()=>organizationName("a".repeat(101)));assert.throws(()=>organizationName("a\u0000b"));assert.equal(organizationSlug("ABC"),"abc");assert.throws(()=>organizationSlug("a--b"));assert.throws(()=>pageInput({limit:101}));const cursor=encodeCursor({createdAt:new Date(),id:"opaque"});assert.ok(pageInput({cursor}).cursor);assert.throws(()=>pageInput({cursor:`${cursor}=`}));
 console.info("Organizations independent native dispatch contract passed (HTTP/auth.api, PostgreSQL, no optional capabilities).");
}finally{await pool?.end();docker("rm","-f",fixtureName);}
