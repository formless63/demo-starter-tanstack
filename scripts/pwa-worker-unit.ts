import {build} from 'vite';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {publicAssets} from '../src/integrations/pwa-offline/config';
const manifest=await Promise.all(publicAssets.map(async url=>{const bytes=await readFile(`public/${url}`);return {url,revision:createHash('sha256').update(bytes).digest('hex'),integrity:`sha256-${createHash('sha256').update(bytes).digest('base64')}`};}));
const entries=new Map<string,Map<string,Response>>();let fetches=0;let denySecond=false;let unregistered=false;
// Bun Request credentials differ from browsers; the VM records constructor options. Native Chromium remains the transport gate.
class BrowserRequest {url:string;credentials:string;redirect:string;integrity:string;constructor(url:string,options:RequestInit={}){this.url=url;this.credentials=options.credentials??'same-origin';this.redirect=options.redirect??'follow';this.integrity=options.integrity??'';}}
const clone=(response:Response)=>{const result=response.clone();Object.defineProperty(result,'url',{value:response.url});Object.defineProperty(result,'type',{value:'basic'});return result;};
const caches={has:async(name:string)=>entries.has(name),keys:async()=>[...entries.keys()],delete:async(name:string)=>entries.delete(name),open:async(name:string)=>{
 let values=entries.get(name);if(!values){values=new Map();entries.set(name,values);}const storage=values;
 return {keys:async()=>[...storage.keys()].map(url=>new Request(url)),match:async(url:string)=>{const response=storage.get(url);return response?clone(response):undefined;},put:async(url:string,response:Response)=>{storage.set(url,clone(response));}};
}};
async function createWorker(version:string,retired=false) {
 const result=await build({configFile:false,publicDir:false,logLevel:'silent',build:{write:false,lib:{entry:'src/integrations/pwa-offline/pwa-offline-sw.ts',formats:['iife'],name:'PwaWorkerUnit'}},define:{'self.__WB_MANIFEST':JSON.stringify(manifest),__PWA_OFFLINE_VERSION__:JSON.stringify(version)}});
 const output=Array.isArray(result)?result[0]:result;assert.ok('output' in output);const chunk=output.output.find(item=>item.type==='chunk');assert.ok(chunk&&chunk.type==='chunk');let code=chunk.code;if(retired)code=code.replace(/retired:\s*!1|retired:\s*false/,'retired:true');
 const events=new Map<string,(event:unknown)=>void>();
 runInNewContext(code,{URL,Request:BrowserRequest,Response,AbortController,Uint8Array,btoa,crypto:webcrypto,setTimeout,clearTimeout,caches,
 self:{registration:{scope:'https://fixture.test/',unregister:async()=>{unregistered=true;}},addEventListener:(name:string,callback:(event:unknown)=>void)=>events.set(name,callback)},
 fetch:async(request:Request)=>{fetches++;assert.equal(request.credentials,'omit');assert.equal(request.redirect,'error');assert.ok(request.integrity.startsWith('sha256-'));const url=new URL(request.url);const response=new Response(await readFile(`public${url.pathname}`),{headers:{'content-type':url.pathname.endsWith('.html')?'text/html':'image/png','cache-control':denySecond&&url.pathname.endsWith('.png')?'private':'public, immutable'}});Object.defineProperty(response,'type',{value:'basic'});Object.defineProperty(response,'url',{value:request.url});return response;}});
 return async(name:string)=>{let promise:Promise<unknown>=Promise.resolve();events.get(name)?.({waitUntil:(value:Promise<unknown>)=>{promise=value;}});await promise;};
}
const first=await createWorker('one');await first('install');assert.equal(entries.size,1);assert.equal([...entries.values()][0].size,3);const previous=fetches;
denySecond=true;const replacement=await createWorker('one');await replacement('install');assert.equal(fetches,previous,'Same-version existing cache is verified without network or mutation');
const update=await createWorker('two');await assert.rejects(()=>update('install'));assert.equal(entries.size,1,'Late-resource failure deletes only its new partial cache');assert.equal([...entries.values()][0].size,3);
const originalKey=[...entries.keys()][0];entries.get(originalKey)?.delete('https://fixture.test/pwa-offline/offline.html');await assert.rejects(()=>replacement('install'));assert.equal(entries.size,1,'Existing incomplete cache is never deleted');
await caches.open('unrelated-owner');const retire=await createWorker('retirement',true);await retire('activate');assert.ok(unregistered);assert.deepEqual([...entries.keys()],['unrelated-owner']);
console.info('Bundled worker VM regression: same-version integrity reuse, failed late-resource update, incomplete-cache preservation and owned retirement passed (supplements native browser tests)');
