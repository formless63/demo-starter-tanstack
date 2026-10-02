import assert from 'node:assert/strict';
import { readFile,stat,readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve,join } from 'node:path';
import { pathToFileURL } from 'node:url';
// Disposable generated consumer's native Node deployment adapter. No production credentials/services.
export async function startConsumer() {
 assert.equal(JSON.parse(await readFile('package.json','utf8')).name,'pwa-offline-clean-install');
 // Fail before rendering if a fixture build inherited test/development JSX transforms.
 for(const file of await readdir('dist/server',{recursive:true})) {
  if(!file.endsWith('.js'))continue;
  assert.doesNotMatch(await readFile(join('dist/server',file),'utf8'),/from\s*["']react\/jsx-dev-runtime["']/,'Native production server must not import development JSX runtime');
 }
 process.env.NODE_ENV='production';
 const runtime=await import(pathToFileURL(resolve('dist/server/server.js')).href);
 assert.equal(typeof runtime.default.fetch,'function','Actual generated Start production handler');
 const options={retire:false,denyPng:false,assetRequests:0};
 const server=createServer(async(request,response)=>{
  try{
   const origin=`http://${request.headers.host}`;const url=new URL(request.url??'/',origin);const path=join(resolve('dist/client'),url.pathname);
   if(!path.startsWith(resolve('dist/client')+'/'))throw new Error('Fixture path escape');
   let file=path;if(options.retire&&url.pathname==='/pwa-offline-sw.js')file=resolve('public/pwa-offline-sw.js');
   let isFile=false;try{isFile=(await stat(file)).isFile();}catch{}
   if(isFile){
    if(url.pathname.startsWith('/pwa-offline/'))options.assetRequests++;
    const png=file.endsWith('.png');const html=file.endsWith('.html');
    response.setHeader('content-type',png?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.webmanifest')?'application/manifest+json':'text/html; charset=utf-8');
    response.setHeader('cache-control',url.pathname.startsWith('/pwa-offline/')?(png?(options.denyPng?'private, no-store':'public, max-age=31536000, immutable'):html?'public, max-age=300':'no-store'):'no-store');
    response.end(await readFile(file));return;
   }
   const result:Response=await runtime.default.fetch(new Request(url));response.statusCode=result.status;result.headers.forEach((value,key)=>response.setHeader(key,value));response.end(Buffer.from(await result.arrayBuffer()));
  }catch{response.statusCode=500;response.end('Fixture failure');}
 });
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address!=='string');
 return {origin:`http://127.0.0.1:${address.port}`,options,close:async()=>{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}};
}
