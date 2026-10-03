// Explicit operator command. Never called by import/start/build.
import {db} from '../src/db';
import {defineFeatureFlags} from '../src/integrations/feature-flags/feature-flags.server';
import {applicationPolicy,personalPolicyContext} from '../src/lib/application-policy.server';
const [command,actorId,tenantId,targetId]=process.argv.slice(2);
if(!actorId||!['create-disabled-flag','enable-flag','disable-flag','grant-read-only','revoke-read-only'].includes(command??''))throw new Error('Usage: identity-demo.ts <create-disabled-flag|enable-flag|disable-flag> <operator-id> OR <grant-read-only|revoke-read-only> <owner-id> <tenant-id> <subject-id>');
try{
 if(command==='grant-read-only'||command==='revoke-read-only'){
  if(!tenantId||!targetId)throw new Error('Explicit tenant and subject are required.');
  await applicationPolicy[command==='grant-read-only'?'grantRole':'revokeRole'](db,personalPolicyContext(actorId),{scope:{kind:'tenant',id:tenantId},userId:targetId,roleId:'demo-read-only'});
 }else{
  const flags=defineFeatureFlags({managementGuard:actor=>actor.authority==='operator'}),actor={userId:actorId,authority:'operator' as const};
  if(command==='create-disabled-flag')await flags.createDefinition(db,actor,{key:'beta.dashboard',description:'Local demonstration panel',enabled:false,defaultValue:true});
  else{const page=await flags.listDefinitions(db,actor);const flag=page.items.find(row=>row.key==='beta.dashboard');if(!flag)throw new Error('Create the local demonstration flag explicitly first.');await flags.updateDefinition(db,actor,{key:flag.key,expectedRevision:flag.revision,enabled:command==='enable-flag'});}
 }
 console.log('Identity demonstration operation completed.');
}finally{await db.$client.end();}
