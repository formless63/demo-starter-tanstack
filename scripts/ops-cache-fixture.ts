import {createServer,connect} from 'node:net';
import {createCache} from '../src/integrations/cache/cache.server';
import {createOpsInspector} from '../src/integrations/ops-admin/ops.server';
const commands:string[]=[];
const proxy=createServer(socket=>{
 const upstream=connect({host:'127.0.0.1',port:6379});let buffer=Buffer.alloc(0);
 socket.on('data',chunk=>{
  buffer=Buffer.concat([buffer,chunk]);
  while(buffer.length){
   const text=buffer.toString();const start=/^\*(\d+)\r\n/.exec(text);if(!start)throw new Error('RESP array expected');
   let offset=start[0].length;const values:string[]=[];let complete=true;
   for(let i=0;i<Number(start[1]);i++){const length=/^\$(\d+)\r\n/.exec(text.slice(offset));if(!length){complete=false;break;}offset+=length[0].length;const n=Number(length[1]);if(buffer.length<offset+n+2){complete=false;break;}values.push(buffer.subarray(offset,offset+n).toString());offset+=n+2;}
   if(!complete)break;commands.push(values[0].toUpperCase());buffer=buffer.subarray(offset);
  }
 });
 socket.pipe(upstream).pipe(socket);socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());socket.on('close',()=>upstream.destroy());
});
await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));const address=proxy.address();if(!address || typeof address==='string')throw new Error();
const cache=createCache({env:{CACHE_URL:`redis://127.0.0.1:${address.port}`,CACHE_KEY_PREFIX:'ops-fixture'}});
try{
 const inspect=createOpsInspector([{id:'cache',title:'Cache connection',isConfigured:()=>true,inspect:async()=>{await cache.checkCache();return {status:'ok'};}}]);
 if(commands.length)throw new Error('Startup contacted cache');
 const result=await inspect();
 if(result.adapters[0].status!=='ok'|| !commands.includes('PING')||commands.some(x=>!['PING','HELLO','CLIENT'].includes(x)))throw new Error('Ops read-only cache canary failed');
 console.info('Ops real Valkey PING/connection-metadata-only canary passed');
}finally{await cache.close();await new Promise<void>(resolve=>proxy.close(()=>resolve()));}
