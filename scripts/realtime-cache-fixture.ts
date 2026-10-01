import assert from "node:assert/strict";
import { execFileSync, fork, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createCache } from "../src/integrations/cache/cache.server";
import { createRealtime, defineRealtimeEvents } from "../src/integrations/realtime/realtime.server";
import { cacheRealtime } from "../src/lib/realtime-cache.server";
const registry = defineRealtimeEvents({ "fixture.event": z.strictObject({ value: z.string() }) });
if (process.argv[2] === "worker") {
  const cache = createCache(), realtime = createRealtime(registry), fanout = cacheRealtime(realtime, registry, cache);
  realtime.subscribe(["fixture"], event => process.send?.({ kind: "event", body: event.body }));
  let subscription = await fanout.subscribe("fixture"); process.send?.({ kind: "ready" });
  process.on("message", async (value: { kind: string; value?: string }) => {
    try {
      if (value.kind === "publish") { await fanout.publish("fixture", "fixture.event", { value: value.value ?? "" }); process.send?.({ kind: "published" }); }
      if (value.kind === "recreate") { await subscription.unsubscribe(); subscription = await fanout.subscribe("fixture"); process.send?.({ kind: "ready" }); }
      if (value.kind === "close") { await subscription.unsubscribe(); realtime.close(); await cache.close(); process.exit(0); }
    } catch { process.send?.({ kind: "unavailable" }); }
  });
} else {
  const name = `realtime-valkey-${randomUUID()}`, children: ChildProcess[] = [];
  const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore","pipe","pipe"] }).trim();
  const mailboxes = new Map<ChildProcess, { kind: string; body?: string }[]>();
  async function wait(child: ChildProcess, kind: string) {
    const deadline = Date.now()+15000;
    while (Date.now()<deadline) { const mailbox = mailboxes.get(child) ?? []; const index = mailbox.findIndex(m => m.kind === kind); if (index>=0) return mailbox.splice(index,1)[0]; await new Promise(r => setTimeout(r,20)); }
    throw new Error(`Fixture child did not report ${kind}`);
  }
  try {
    const allocator = createServer(); await new Promise<void>(resolve => allocator.listen(0,"127.0.0.1",resolve)); const allocated = allocator.address(); assert.ok(allocated && typeof allocated !== "string"); const selectedPort = allocated.port; await new Promise<void>(resolve=>allocator.close(()=>resolve()));
    docker("run","-d","--name",name,"-p",`127.0.0.1:${selectedPort}:6379`,"valkey/valkey:9.1.2-alpine","valkey-server","--save","","--appendonly","no");
    const port = docker("port",name,"6379/tcp").split(":").at(-1);
    for (let i=0;i<100;i++) { try { if (docker("exec",name,"valkey-cli","ping")==="PONG") break; } catch {} await new Promise(r => setTimeout(r,100)); }
    for (let i=0;i<2;i++) {
      const child = fork(fileURLToPath(import.meta.url),["worker"],{ env:{...process.env,CACHE_URL:`redis://127.0.0.1:${port}`,CACHE_KEY_PREFIX:"realtime-fixture"},stdio:["ignore","inherit","inherit","ipc"] });
      children.push(child); mailboxes.set(child,[]); child.on("message", value => mailboxes.get(child)?.push(value as { kind:string;body?:string }));
    }
    await Promise.all(children.map(child=>wait(child,"ready")));
    children[0].send({kind:"publish",value:"first"}); await wait(children[0],"published");
    const first = await Promise.all(children.map(child=>wait(child,"event"))); assert.equal(first[0].body,first[1].body);
    assert.ok(children.every(child=>!mailboxes.get(child)?.some(m=>m.kind==="event")),"Single cache fanout path must not double-deliver locally");
    docker("stop",name); children[0].send({kind:"publish",value:"lost-during-outage"}); await wait(children[0],"unavailable");
    docker("start",name); for (let i=0;i<100;i++) { try { if (docker("exec",name,"valkey-cli","ping")==="PONG") break; } catch {} await new Promise(r=>setTimeout(r,100)); } for (const child of children) child.send({kind:"recreate"}); await Promise.all(children.map(child=>wait(child,"ready")));
    assert.ok(children.every(child=>!mailboxes.get(child)?.some(m=>m.kind==="event")),"No outage replay exists");
    children[0].send({kind:"publish",value:"after-explicit-recreation"}); await wait(children[0],"published"); const restored=await Promise.all(children.map(child=>wait(child,"event"))); assert.equal(restored[0].body,restored[1].body); assert.equal(JSON.parse(restored[0].body as string).data.value,"after-explicit-recreation");
    console.info("Two real Node processes: optional Valkey fanout, single delivery path, outage loss and explicit subscription recreation verified");
  } finally {
    await Promise.all(children.map(child=>new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},12000);child.once("exit",()=>{clearTimeout(timer);resolve();});if(child.connected)child.send({kind:"close"});else{clearTimeout(timer);resolve();}})));
    try { docker("rm","-f",name); } catch {}
  }
}
