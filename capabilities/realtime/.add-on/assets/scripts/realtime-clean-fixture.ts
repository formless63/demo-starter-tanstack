import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
const cta = JSON.parse(await readFile(".cta.json","utf8")); assert.equal(cta.projectName,"realtime-addon-clean-install"); assert.ok(resolve(process.cwd()).includes("realtime-addon-"));
const allocator=createServer(); await new Promise<void>(resolve=>allocator.listen(0,"127.0.0.1",resolve)); const address=allocator.address(); assert.ok(address&&typeof address!=="string"); const port=address.port;await new Promise<void>(resolve=>allocator.close(()=>resolve()));
const app=spawn("node",[".output/server/index.mjs"],{stdio:["ignore","ignore","inherit"],env:{...process.env,PORT:String(port),HOST:"127.0.0.1",DATABASE_URL:"",CACHE_URL:"",REALTIME_TRANSPORTS:"sse,websocket"}});
try {
  const base=`http://127.0.0.1:${port}`;let healthy=false;
  for(let i=0;i<100;i++){try{healthy=(await fetch(base,{signal:AbortSignal.timeout(500)})).ok;}catch{}if(healthy)break;assert.equal(app.exitCode,null);await new Promise(r=>setTimeout(r,100));}
  assert.ok(healthy,"Backendless compiled Node app must start");assert.equal((await fetch(`${base}/api/realtime/sse`)).status,401);
  const socket = new WebSocket(base.replace("http:","ws:")+"/api/realtime/websocket");
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Denied WS must close")),3000);socket.onopen=()=>{clearTimeout(timer);reject(new Error("Deny-all application authorizer must not accept"));};socket.onerror=()=>{clearTimeout(timer);resolve();};});
  console.info("Compiled Nitro Node app starts with no database/Cache and denies unauthenticated SSE/WS by default");
} finally {app.kill("SIGTERM");await new Promise<void>(resolve=>{const timer=setTimeout(()=>{app.kill("SIGKILL");resolve();},3000);app.once("exit",()=>{clearTimeout(timer);resolve();});});}
