import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { adminGet,exactJson,validateEndpoint } from '../src/integrations/medusa/transport.server';
import { bridgeEvent,encodeCursor,localCursor,MedusaError,pageCursor,parse,scopeSchema } from '../src/integrations/medusa/contract';
import { exactTotal,projection } from '../src/integrations/medusa/projection';
import { medusaJobPayload } from '../src/integrations/medusa/jobs.server';
import { signWebhook,verifyWebhookSignature } from '../src/integrations/webhooks/protocol.server';
import { deliverBridge } from '../src/integrations/medusa/producer.server';
process.env.NODE_ENV='test';
const id=randomUUID(),bindingId=randomUUID();
for(const url of ['http://localhost:9000','http://127.1:9000','http://2130706433:9000','http://0x7f000001:9000','http://example.test','https://user:secret@example.test','https://example.test/#fragment'])assert.throws(()=>validateEndpoint(url,true));
assert.equal(validateEndpoint('http://127.0.0.1:9000',true),'http://127.0.0.1:9000');assert.throws(()=>validateEndpoint('http://127.0.0.1:9000',false));assert.equal(validateEndpoint('http://[::1]:9000',true),'http://[::1]:9000');
assert.throws(()=>parse(scopeSchema,{kind:'user',id:'bad\u0000'}));assert.throws(()=>parse(scopeSchema,{kind:'user',id:'\ud800'}));assert.throws(()=>parse(bridgeEvent,{version:1,id,type:'order.placed',resourceKind:'product',resourceId:'p'}));
const c=encodeCursor([1,'2026-10-02T00:00:00.000Z',id]);assert.equal(localCursor(c)?.[2],id);assert.throws(()=>localCursor(c+'='));assert.throws(()=>localCursor(encodeCursor([1,'2026-02-30T00:00:00.000Z',id])));assert.throws(()=>pageCursor(encodeCursor([1,'order','default',0]),'product','default'));
assert.equal(exactTotal('9007199254740993.12340000'),'9007199254740993.1234');assert.throws(()=>exactTotal(9007199254740993));assert.throws(()=>exactTotal('1e10'));
assert.equal((exactJson('{"total":9007199254740993.1234,"email":"private@example.test"}') as {total:string}).total,'9007199254740993.1234');
const p=projection('order',bindingId,'order_1',exactJson('{"order":{"id":"order_1","status":"secret-state","total":9007199254740993.1234,"currency_code":"usd","email":"private@example.test","metadata":{"token":"private"}}}'));
assert.equal(p.status,'unknown');assert.ok(!JSON.stringify(p).includes('private'));assert.equal('total' in p?p.total:null,'9007199254740993.1234');
assert.throws(()=>projection('product',bindingId,'p',{product:{id:'p',title:'a'.repeat(257)}}));assert.throws(()=>medusaJobPayload.parse({operationId:id,token:'private'}));
const secret=`whsec_${Buffer.alloc(32,1).toString('base64')}`,previous=`whsec_${Buffer.alloc(32,2).toString('base64')}`;const timestamp=Math.floor(Date.now()/1000);const event={version:1 as const,id,type:'product.updated' as const,resourceKind:'product' as const,resourceId:'product_1'};const bytes=Buffer.from(JSON.stringify(event));const headers=new Headers({'webhook-id':id,'webhook-timestamp':String(timestamp),'webhook-signature':signWebhook(id,timestamp,bytes,previous)});assert.equal(verifyWebhookSignature(bytes,headers,{secrets:[secret,previous]}),id);assert.throws(()=>verifyWebhookSignature(Buffer.from('tampered'),headers,{secrets:[secret,previous]}));for(const t of [timestamp-301,timestamp+301]){headers.set('webhook-timestamp',String(t));headers.set('webhook-signature',signWebhook(id,t,bytes,secret));assert.throws(()=>verifyWebhookSignature(bytes,headers,{secrets:[secret]}));}
let requests=0,closed=0;
const server=createServer((req,res)=>{requests++;assert.equal(req.headers.authorization,`Basic ${Buffer.from('fixture-secret:').toString('base64')}`);assert.equal(req.headers['x-medusa-access-token'],undefined);req.on('close',()=>closed++);const u=new URL(req.url??'','http://fixture');assert.equal(u.searchParams.get('fields'),'id,title,handle,status,updated_at');
 if(u.pathname.endsWith('/slow-header')){setTimeout(()=>{res.end('{}');},150);return;}
 if(u.pathname.endsWith('/slow-body')){res.writeHead(200,{'content-type':'application/json'});res.write('{');setTimeout(()=>res.end('}'),150);return;}
 if(u.pathname.endsWith('/oversize')){res.end('x'.repeat(2*1024*1024+1));return;}
 if(u.pathname.endsWith('/redirect')){res.writeHead(302,{location:'/admin/products/product_1'});res.end();return;}
 if(u.pathname.endsWith('/error')){res.writeHead(503);res.end('private body');return;}
 if(u.pathname.endsWith('/missing')){res.writeHead(404);res.end('{}');return;}
 assert.equal(u.pathname,'/admin/products/product_1');res.end(JSON.stringify({product:{id:'product_1',title:'Fixture',status:'published',metadata:{secret:'private'}}}));
});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address==='object');const connection={id:'default',baseUrl:`http://127.0.0.1:${address.port}`,secretApiKey:'fixture-secret'};
try{
 assert.ok(await adminGet(connection,'product',{remoteId:'product_1'}));assert.equal(await adminGet(connection,'product',{remoteId:'missing'}),null);
 for(const remoteId of ['slow-header','slow-body'])await assert.rejects(adminGet(connection,'product',{remoteId,timeoutMs:25}),e=>e instanceof MedusaError&&e.code==='deadline_exceeded');
 const controller=new AbortController();setTimeout(()=>controller.abort(),25);await assert.rejects(adminGet(connection,'product',{remoteId:'slow-body',signal:controller.signal}),e=>e instanceof MedusaError&&e.code==='cancelled');
 await assert.rejects(adminGet(connection,'product',{remoteId:'oversize'}),e=>e instanceof MedusaError&&e.code==='limit_exceeded');
 const before=requests;await assert.rejects(adminGet(connection,'product',{remoteId:'redirect'}));assert.equal(requests,before+1);await assert.rejects(adminGet(connection,'product',{remoteId:'error'}),e=>e instanceof MedusaError&&!e.message.includes('private'));
 let delivered='';await deliverBridge(event,{targetUrl:`${connection.baseUrl}/api/integrations/medusa/webhooks/default`,connectionId:'default',secret,development:true,fetch:async(_url,init)=>{const b=new Uint8Array(init?.body as Uint8Array);const h=new Headers(init?.headers);assert.equal(verifyWebhookSignature(b,h,{secrets:[secret]}),id);delivered=Buffer.from(b).toString();return new Response('{"accepted":true}');}});assert.equal(JSON.parse(delivered).id,id);assert.ok(!delivered.includes('metadata'));
 assert.ok(closed>=3);
}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
console.info(JSON.stringify({fixture:'medusa.protocol',runtime:process.versions.bun?'bun':'node',outcome:'passed'}));
