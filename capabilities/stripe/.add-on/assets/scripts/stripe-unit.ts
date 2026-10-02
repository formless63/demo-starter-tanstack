import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {createServer} from "node:http";
import {validateConnection,type StripeConnection} from "../src/integrations/stripe/config.server";
import {API_VERSION,REPLAY_WINDOW,replayAllowed,StripeCapabilityError} from "../src/integrations/stripe/contract";
import {withStripe} from "../src/integrations/stripe/transport.server";
import {verifyStripeRequest} from "../src/integrations/stripe/webhook.server";
const config:StripeConnection={id:"default",secretKey:"sk_test_fixture",accountId:"acct_fixture",mode:"test",webhookSecrets:["whsec_current","whsec_previous"]};
assert.throws(()=>validateConnection({...config,endpoint:"http://localhost/"}));
let calls=0;let mode="ok";let actualBody="";
const server=createServer((req,res)=>{calls++;req.on("data",chunk=>actualBody+=chunk);req.on("end",()=>{
 assert.equal(req.headers.authorization,"Bearer sk_test_fixture");assert.equal(req.headers["stripe-version"],API_VERSION);assert.equal(req.headers["stripe-account"],undefined);
 if(mode==="slow"){res.writeHead(200,{"content-type":"application/json"});res.write('{"id":"');return;}
 if(mode==="overflow"){res.end('x'.repeat(2*1024*1024+1));return;}
 if(mode==="cached500"){res.writeHead(500,{"content-type":"application/json"});res.end('{"error":{"type":"api_error","message":"private"}}');return;}
 res.setHeader("content-type","application/json");res.end('{"id":"cs_fixture","object":"checkout.session"}');
});});
await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();assert.ok(address&&typeof address!=="string");
const connection={...config,endpoint:`http://127.0.0.1:${address.port}/`};
try {
 await withStripe(connection,undefined,sdk=>sdk.checkout.sessions.create({mode:"payment",customer:"cus_fixture",line_items:[{price:"price_fixture",quantity:1}],success_url:"https://app.example/success",cancel_url:"https://app.example/cancel"},{idempotencyKey:"gs-stripe:fixture"}));
 assert.equal(new URLSearchParams(actualBody).get("line_items[0][price]"),"price_fixture");assert.equal(calls,1);
 mode="slow";const controller=new AbortController();const pending=withStripe(connection,controller.signal,sdk=>sdk.checkout.sessions.retrieve("cs_fixture"));setTimeout(()=>controller.abort(),50);await assert.rejects(pending,(e:unknown)=>e instanceof StripeCapabilityError&&e.code==="cancelled");
 mode="overflow";await assert.rejects(withStripe(connection,undefined,sdk=>sdk.checkout.sessions.retrieve("cs_fixture")),(e:unknown)=>e instanceof StripeCapabilityError&&e.code==="limit_exceeded");
 mode="cached500";const before=calls;await assert.rejects(withStripe(connection,undefined,sdk=>sdk.checkout.sessions.retrieve("cs_fixture")));assert.equal(calls,before+1);
 const event={id:"evt_fixture",object:"event",api_version:API_VERSION,type:"checkout.session.completed",livemode:false,data:{object:{object:"checkout.session",id:"cs_fixture"}}};const body=JSON.stringify(event);const timestamp=Math.floor(Date.now()/1000);const signature=createHmac("sha256","whsec_previous").update(`${timestamp}.${body}`).digest("hex");
 const hint=await verifyStripeRequest(new Request("http://127.0.0.1/",{method:"POST",body,headers:{"stripe-signature":`t=${timestamp},v1=invalid,v1=${signature}`}}),config);assert.equal(hint.remoteId,"cs_fixture");
 assert.equal(replayAllowed(new Date(0),new Date(REPLAY_WINDOW)),false);
 console.info(`Stripe pinned SDK ${API_VERSION} local wire/signature fixtures passed on ${process.versions.bun?"Bun "+process.versions.bun:"Node "+process.versions.node}; no provider API requests.`);
} finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
