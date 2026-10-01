import assert from "node:assert/strict";
import { createServer } from "node:http";
import { inspect } from "node:util";
import { z } from "zod";
import { type AiConfig, AiError, createAi } from "../src/integrations/ai/ai.server";

export async function runAiFixture(factory: typeof createAi = createAi) {
 const requests: { mode: string; body: Record<string, unknown>; authorization?: string }[] = [];
 let disconnected = 0, completedStreams = 0;
 const timers = new Set<ReturnType<typeof setTimeout>>();
 const server = createServer(async (req, res) => {
  const buffers: Buffer[] = [];
  for await (const buffer of req) buffers.push(buffer);
  const body = JSON.parse(Buffer.concat(buffers).toString());
  const mode = body.messages[0].content;
  requests.push({ mode, body, authorization: req.headers.authorization });
  assert.equal(req.url, "/v1/chat/completions");
  res.on("close", () => { if (!res.writableEnded) disconnected++; });
  if (["auth", "rate", "unavailable", "bad-request"].includes(mode)) {
   res.writeHead(({ auth: 401, rate: 429, unavailable: 503, "bad-request": 400 } as Record<string, number>)[mode], { "content-type": "application/json" });
   res.end(JSON.stringify({ error: { message: "fixture-private-key PROMPT PRIVATE OUTPUT", type: "fixture", code: "fixture" } })); return;
  }
  if (mode === "stall") { res.writeHead(200, { "content-type": "application/json" }); res.flushHeaders(); return; }
  const tokens = { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 };
  if (body.stream) {
   res.writeHead(200, { "content-type": "text/event-stream" });
   const chunk = (content: string | null, reason: string | null = null) => res.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content }, finish_reason: reason }] })}\n\n`);
   if (mode === "oversized") { chunk("x".repeat(1024 * 1024 + 1)); return; }
   if (mode === "accumulated-oversized") { for (let index = 0; index < 17; index++) chunk("é".repeat(32768)); return; }
   chunk("hello ");
   if (mode === "stream-stall") return;
   const timer = setTimeout(() => {
    timers.delete(timer);
    if (res.destroyed) return;
    if (mode === "stream-failure") { res.write('data: {broken}\n\n'); res.end(); return; }
    chunk("world"); chunk(null, "stop");
    res.write(`data: ${JSON.stringify({ choices: [], usage: tokens })}\n\n`);
    completedStreams++;
    res.end("data: [DONE]\n\n");
   }, 80);
   timers.add(timer);
   return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  const text = mode === "structured" ? '{"answer":42}' : mode === "malformed" ? '{broken' : mode === "schema-invalid" ? '{"answer":"private-output"}' : mode === "oversized" ? "x".repeat(1024 * 1024 + 1) : mode === "boundary" ? "x".repeat(1024 * 1024) : "hello world";
  res.end(JSON.stringify({ id: "fixture", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }], usage: mode === "bad-usage" ? { prompt_tokens: -1, completion_tokens: 1.5, total_tokens: Infinity } : tokens }));
 });
 await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
 const address = server.address(); assert.ok(address && typeof address === "object");
 const previous = process.env.NODE_ENV; process.env.NODE_ENV = "test";
 const config: AiConfig = { provider: "openai-compatible", model: "fixture-model", baseUrl: `http://127.0.0.1:${address.port}/v1`, timeoutSeconds: 1 };
 const ai = factory(config);
 const input = (mode: string, signal?: AbortSignal) => ({ messages: [{ role: "user" as const, content: mode }], ...(signal ? { signal } : {}) });
 const fails = async (work: Promise<unknown>, code: string) => assert.rejects(work, (error: unknown) => {
  assert.ok(error instanceof AiError); assert.equal(error.code, code);
  for (const value of [JSON.stringify(error), inspect(error)]) assert.ok(!/fixture-private-key|PROMPT PRIVATE|private-output|http:\/\//.test(value));
  return true;
 });
 const closed = async (before: number) => {
  const until = Date.now() + 2000;
  while (disconnected <= before && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(disconnected > before, "operation must abort the real socket");
 };
 try {
  assert.equal(requests.length, 0);
  const ordinary = await ai.generateText({ ...input("ordinary"), temperature: 0, maxOutputTokens: 1 });
  assert.deepEqual(ordinary, { text: "hello world", finishReason: "stop", usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } });
  assert.equal(requests[0].authorization, undefined);
  assert.equal(requests[0].body.model, "fixture-model"); assert.equal(requests[0].body.max_tokens, 1); assert.equal(requests[0].body.temperature, 0);
  const authAi = factory({ ...config, apiKey: "fixture-api-key" }); await authAi.generateText(input("ordinary"));
  assert.equal(requests.at(-1)?.authorization, "Bearer fixture-api-key");
  assert.equal((await ai.generateText(input("boundary"))).text.length, 1024 * 1024);
  assert.equal((await ai.generateText(input("bad-usage"))).usage, undefined);
  assert.deepEqual((await ai.generateStructured(input("structured"), z.object({ answer: z.number() }))).object, { answer: 42 });
  assert.deepEqual(requests.at(-1)?.body.response_format, { type: "json_object" });
  await fails(ai.generateStructured(input("malformed"), z.object({ answer: z.number() })), "invalid-output");
  await fails(ai.generateStructured(input("schema-invalid"), z.object({ answer: z.number() })), "invalid-output");
  await fails(ai.generateStructured(input("oversized"), z.unknown()), "invalid-output");
  for (const [mode, code] of [["auth", "authentication"], ["rate", "rate-limit"], ["unavailable", "unavailable"], ["bad-request", "invalid-request"], ["oversized", "invalid-output"]]) {
   const before: number = requests.length; await fails(ai.generateText(input(mode)), code); assert.equal(requests.length, before + 1, "no retry");
  }
  const streamCount = completedStreams;
  const stream = ai.streamText(input("ordinary"));
  assert.deepEqual((await stream.next()).value, { type: "text-delta", text: "hello " });
  assert.equal(completedStreams, streamCount, "first delta delivered before server completes");
  const events = []; for await (const event of stream) events.push(event);
  assert.deepEqual(events, [{ type: "text-delta", text: "world" }, { type: "finish", finishReason: "stop", usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } }]);
  const drain = async (mode: string) => { for await (const _event of ai.streamText(input(mode))) { /* exercise actual transport */ } };
  await fails(drain("stream-failure"), "invalid-output");
  await fails(drain("accumulated-oversized"), "invalid-output");
  let before = disconnected; await fails(drain("oversized"), "invalid-output"); await closed(before);
  for (const mode of ["stall", "stream-stall"]) {
   before = disconnected; const started = Date.now();
   await fails(mode === "stall" ? ai.generateText(input(mode)) : drain(mode), "timeout");
   assert.ok(Date.now() - started < 2500); await closed(before);
  }
  for (const mode of ["stall", "stream-stall"]) {
   const controller = new AbortController(); before = disconnected;
   const work = mode === "stall" ? ai.generateText(input(mode, controller.signal)) : (async () => { for await (const _event of ai.streamText(input(mode, controller.signal))) {} })();
   const result = fails(work, "cancelled");
   await new Promise(resolve => setTimeout(resolve, 40)); controller.abort(); await result; await closed(before);
  }
  before = disconnected; const paused = ai.streamText(input("stream-stall")); await paused.next();
  await new Promise(resolve => setTimeout(resolve, 1100)); await closed(before); await fails(paused.next(), "timeout");
  before = disconnected; const cancelled = ai.streamText(input("stream-stall")); await cancelled.next(); await cancelled.return?.(); await closed(before);
  before = disconnected; const pending = ai.streamText(input("stream-stall")); await pending.next(); const next = fails(pending.next(), "cancelled"); const returned = pending.return?.(); await next; await returned; await closed(before);
  const controller = new AbortController(); controller.abort(); const count = requests.length;
  await fails(ai.generateText(input("ordinary", controller.signal)), "cancelled"); assert.equal(requests.length, count);
  const invalidCount = requests.length; await fails(ai.generateText({ messages: [] }), "invalid-request"); assert.equal(requests.length, invalidCount);
 } finally {
  if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  for (const timer of timers) clearTimeout(timer);
  await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
 }
 console.info("AI local HTTP fixture passed: completion, streaming, structured validation, safe errors, no retries, limits and real socket cancellation");
}
