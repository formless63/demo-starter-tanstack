import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {rm} from 'node:fs/promises';
const id=process.argv[2];assert.ok(['organizations','authorization','feature-flags'].includes(id));
const output=`capabilities/${id}/test/.node-contract.mjs`,child='capabilities/organizations/test/.node-accept-child.mjs';
try{
 execFileSync('node',['-e',"if(process.versions.node.split('.')[0]!=='24')throw new Error('Node24 required');console.log('Node '+process.version)"],{stdio:'inherit'});
 if(id==='organizations')execFileSync(process.execPath,['build','capabilities/organizations/test/accept-crash-child.ts','--target=node','--external=drizzle-orm/bun-sql',`--outfile=${child}`],{stdio:'inherit'});
 execFileSync(process.execPath,['build',`capabilities/${id}/test/contract.ts`,'--target=node',...(id==='organizations'?['--external=drizzle-orm/bun-sql']:[]),`--outfile=${output}`],{stdio:'inherit'});
 execFileSync('node',[output],{stdio:'inherit',env:{...process.env,...(id==='organizations'?{ORGANIZATIONS_FIXTURE_CHILD:child}:{})}});
}finally{await rm(output,{force:true});if(id==='organizations')await rm(child,{force:true});}
