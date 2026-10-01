# AI

Optional server-only model-access primitive using OpenAI SDK 7.25.0 behind an OpenAI-compatible Chat Completions adapter. Evaluation: [AI_MODULE_EVALUATION.md](../../AI_MODULE_EVALUATION.md). Maintenance: `.agents/skills/ai-change/SKILL.md`.

## Relationships and scope

`requires: []`; optional integrations: Jobs, Object Storage, Observability, Audit Log. Baseline: Node runtime. External model endpoint/configuration required only on use. `defaultInstalled: false`; root reference deliberately enabled. No persistence, UI, agents, tools, MCP, embeddings, vectors, RAG, ingestion, prompt CMS, billing management or queue orchestration.

Core lives under `src/integrations/ai/`; application-owned `src/lib/ai.server.ts` provides optional safe instrumentation and is excluded from independent assets. Jobs may call AI; Storage may store application artifacts; Audit may record occurrence with safe metadata. None are required or imported by core.

## Configuration

All variables are server-only and validated lazily on the first operation.

| Variable | Default / bounds |
| --- | --- |
| `AI_PROVIDER` | `openai-compatible`; sole accepted v1 provider |
| `AI_MODEL` | Required on use; 1–128 printable characters; no guessed model |
| `AI_API_KEY` | Optional; local compatible endpoints may omit auth; never log |
| `AI_BASE_URL` | Optional; default `https://api.openai.com/v1`; explicit HTTPS, or loopback HTTP only with explicit `NODE_ENV=development`/`test` |
| `AI_TIMEOUT_SECONDS` | `60`; integer 1–300 |

URL credentials/query/fragment are rejected. SDK `OPENAI_*` credentials/model/base URL/header settings never determine the public contract; outbound auth comes only from `AI_API_KEY`. No provider access on import, build, start, worker or database health/readiness. No migrations, long-lived service or readiness hook. Operators own endpoint egress policy; configured endpoints must be trusted. Redirects are rejected.

## Public operations

```ts
import { generateText, streamText, generateStructured } from "./src/integrations/ai/ai.server";
import { z } from "zod";
const input = { messages: [{ role: "user" as const, content: "Return a JSON object with an answer number." }] };
const text = await generateText(input);
for await (const event of streamText(input)) { /* application consumes safe deltas/finish */ }
const result = await generateStructured(input, z.object({ answer: z.number() }));
// result.object is validated; result.finishReason and optional result.usage are safe metadata.
```

`createAi(config?)` creates a lazy independent facade for explicit application configuration. Input messages accept only `system`, `user`, `assistant` and text content: 1–100 messages, <=64 KiB UTF-8 each, <=256 KiB total, nonempty role/content. NUL/other inappropriate controls and lone surrogates are rejected; tab/newline/CR are allowed. Unknown fields/parts/options rejected. Optional `temperature` 0–2 inclusive, `maxOutputTokens` integer 1–65536, and `signal: AbortSignal`. Inputs are snapshotted before asynchronous requests.

Text result: `{ text, finishReason, usage? }`; finish reason is `stop | length | content-filter | other`. Usage contains only optional `inputTokens`, `outputTokens`, `totalTokens`, each finite non-negative safe integer; malformed counts are omitted. No raw SDK response/chunk escapes.

Accumulated generated text and encoded structured response are limited to 1 MiB UTF-8. Additional implementation guard bounds transport envelopes to 32 MiB before SDK parsing. Structured success requires provider completion, JSON parse and authoritative application Zod validation (including async refinements); result is `{ object, finishReason, usage? }`. JSON-object response format is requested internally; compatible endpoints must implement it or return an appropriate safe request error. Applications provide a JSON instruction; no hidden prompt rewriting or retry.

Streaming is a real async iterator with incremental `{ type: "text-delta", text }` and exactly one successful `{ type: "finish", finishReason, usage? }`. Failed/truncated streams throw without success finish. The deadline covers headers/body/entire stream, even while a consumer pauses; caller cancellation/timeout abort the network. `return()`/`throw()` abort immediately even with a pending `next()`, and `for await` early exit cleans up. A consumer must finish iteration or call return when discarding a stream. There are no automatic retries.

## Errors and privacy

`AiError` exposes `code`, `retryable`, static safe `message`, and safe `toJSON()`. Codes: configuration, authentication, rate-limit, timeout, unavailable, invalid-request, invalid-output, cancelled, unknown. Only rate-limit/unavailable are defensibly retryable; this is a hint, never an automatic retry. Causes are discarded so ordinary inspection/logging cannot copy SDK bodies/headers, credentials, URLs, prompts or outputs. Applications must not log operation inputs/results themselves by default.

Core emits no telemetry. Optional reference wrapper reports only `generate | stream | structured`, finite `openai-compatible`, finite outcome, duration seconds, valid token counts and finite finish reason. No model metric dimension, prompt/content/JSON/key/raw exchange/user/application IDs. Telemetry failures are swallowed after generating only safe metadata.

## Installation and verification

Select the compiled `capabilities/ai/add-on.json` with official TanStack CLI 0.71.0. `dependsOn: []`, no conflicts. Packages: exact `openai: 7.25.0`, Zod 4; Vitest is test tooling. Official `.add-on/info.json`/assets are authoring source; never hand-edit compiled JSON. Run `bun run add-ons:compile ai` after asset/metadata changes.

- `bun run ai:unit`: backendless config/input/output checks.
- `bun run ai:compat`: actual SDK against deterministic disposable OpenAI-compatible loopback HTTP: completion, chunks, structured/malformed/schema-invalid JSON, auth/rate/server failures, stalls, cancellation and oversized output; no external credentials.
- `bun run ai:reference:smoke`: explicit application-owned instrumentation demonstration against the same fixture; no chat UI or public unauthenticated endpoint.
- `bun test src/integrations/ai src/lib/ai.test.ts`: canonical bounds/lazy behavior, HTTP fixture and failure-isolated safe reference telemetry.
- `bun run add-ons:test ai`: independent clean install, types/tests/backendless build, local HTTP compatibility, remove runtime/config/packages and rebuild.
- Root production image bundles `.output/ai-reference-smoke.mjs`; run explicitly with `docker compose run --rm worker node .output/ai-reference-smoke.mjs`. It creates only a local fixture and does not contact a production provider.

Generic CI discovers AI from the catalog; root unit tests exercise real transport and reference behavior. Normal production verification runs app/health/worker with every AI variable absent.

## Application removal

1. Stop AI call sites and optional Jobs/Storage/Audit/instrumentation wiring. No generic AI queue exists.
2. Remove `src/integrations/ai`, root `src/lib/ai.server.ts`/`ai.test.ts`, `scripts/ai-*.ts`, package `ai:*` scripts and `openai`; retain Zod if other application code uses it.
3. Remove AI environment/secrets and operator deployment config. Remove the Dockerfile AI smoke bundle line. Never revoke/delete external provider credentials/accounts automatically.
4. Remove `ai` from `referenceApplication.enabledCapabilities`, rerun governance/types/tests/build/production checks. There is no database/data migration.
5. Retain add-on authoring assets/docs/skill by default. Pruning them is a separate authoring-source choice; update catalog add-on paths/skill/evaluation/status and documentation coherently.

The CLI provides no uninstall transaction. `scripts/ai-removal-fixture.ts` applies this runtime-only removal only inside its explicitly named disposable scaffold. No external data, account or credential is touched.
