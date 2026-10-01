import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createOpsInspector} from '../src/integrations/ops-admin/ops.server';
import {inspectOpsStorage} from '../src/lib/ops-storage.server';
const requests:string[]=[];
const server=createServer((req,res)=>{requests.push(req.method ?? '');res.writeHead(503,{'Content-Type':'application/xml'});res.end('<Error><Code>SlowDown</Code><Message>private-provider-detail</Message></Error>');});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error();
// Disposable protocol credentials; confined to this loopback fixture process.
Object.assign(process.env,{STORAGE_ENDPOINT:`http://127.0.0.1:${address.port}`,STORAGE_BUCKET:'ops-fixture',STORAGE_REGION:'fixture',STORAGE_ACCESS_KEY_ID:'fixture-key',STORAGE_SECRET_ACCESS_KEY:'fixture-secret',STORAGE_FORCE_PATH_STYLE:'true'});
try{
 const summary=createOpsInspector([{id:'storage',title:'Private storage',isConfigured:()=>true,inspect:inspectOpsStorage}]);
 assert.equal(requests.length,0);
 const result=await summary();assert.deepEqual(requests,['HEAD']);assert.equal(result.adapters[0].status,'unavailable');assert.equal(result.adapters[0].code,'inspection-failed');
 assert.ok(!JSON.stringify(result).includes('private-provider-detail'));assert.ok(!JSON.stringify(result).includes('fixture-secret'));
 console.info('Ops 503 inspection made exactly one HEAD and returned a sanitized unavailable card');
}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
