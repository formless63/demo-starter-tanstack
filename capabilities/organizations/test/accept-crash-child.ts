// Deliberate fixture process interruption. Never installed as an application API.
import {createHmac} from "node:crypto";
import {betterAuth} from "better-auth";
import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import * as baseline from "./auth-schema";
import * as tables from "../../../src/integrations/organizations/schema";
import {defineOrganizations} from "../../../src/integrations/organizations/auth.server";
import {createOrganizationsDrizzleAdapter} from "../../../src/integrations/organizations/adapter.server";
const url=process.env.ORGANIZATIONS_FIXTURE_DATABASE_URL;
const invitationId=process.env.ORGANIZATIONS_FIXTURE_INVITATION_ID;
if(!url||!invitationId||!process.send)throw new Error("Crash fixture requires private process context");
const pool=new Pool({connectionString:url});
const schema={...baseline,...tables};
const db=process.argv.includes("--bun-sql")?(await import("drizzle-orm/bun-sql")).drizzle<typeof schema>({connection:url,schema}):drizzle(pool,{schema});
db.transaction=async()=>{
 process.send?.({phase:"claim-committed"});
 return new Promise<never>(()=>{});
};
const secret="disposable-organization-test-secret-at-least-thirty-two-characters";
const organizations=defineOrganizations();
const auth=betterAuth({baseURL:"http://localhost:3000",secret,database:createOrganizationsDrizzleAdapter(db),logger:{disabled:true},plugins:[organizations.plugin],hooks:{before:organizations.before,after:organizations.after},onAPIError:organizations.onAPIError});
const token="token-recipient";
const headers=new Headers({origin:"http://localhost:3000",cookie:`better-auth.session_token=${encodeURIComponent(`${token}.${createHmac("sha256",secret).update(token).digest("base64")}`)}`});
if(process.argv.includes("--http")){
 await auth.handler(new Request("http://localhost:3000/api/auth/organization/accept-invitation",{method:"POST",headers:new Headers([...headers,["content-type","application/json"]]),body:JSON.stringify({invitationId})}));
}else{await auth.api.acceptInvitation({headers,body:{invitationId}});}
throw new Error("Crash fixture unexpectedly completed admission");
