import {createServer,request} from 'node:http';
import {createOpsInspector} from '../src/integrations/ops-admin/ops.server';
import {checkStorage} from '../src/integrations/storage/storage.server';
const upstream=new URL(process.env.STORAGE_ENDPOINT!);
const methods:string[]=[];
const proxy=createServer((req,res)=>{
 methods.push(req.method ?? '');
 const next=request({hostname:upstream.hostname,port:upstream.port,path:req.url,method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode ?? 503,reply.headers);reply.pipe(res);});
 next.on('error',()=>{res.writeHead(503);res.end();});req.pipe(next);
});
await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));
const address=proxy.address();if(!address || typeof address==='string')throw new Error();
process.env.STORAGE_ENDPOINT=`http://127.0.0.1:${address.port}`;
try{
 const inspect=createOpsInspector([{id:'storage',title:'Private storage',isConfigured:()=>true,inspect:async()=>{await checkStorage();return {status:'ok'};}}]);
 if(methods.length)throw new Error('Startup contacted storage');
 const result=await inspect();
 if(result.adapters[0].status!=='ok' || methods.length!==1 || methods.some(method=>method!=='HEAD'))throw new Error('Ops storage read-only canary failed');
 console.info('Ops real storage HEAD-only canary passed');
}finally{await new Promise<void>(resolve=>proxy.close(()=>resolve()));}
