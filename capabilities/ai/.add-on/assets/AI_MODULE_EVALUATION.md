# AI module evaluation

Research date: 2026-10-01. Only this repository and official upstream SDK/framework materials were consulted; no companion repository access.

## Current official options

npm latest stable metadata read directly from registry.npmjs.org: `openai` 7.25.0 (published 2026-09-29, Node >=22), `ai` 7.0.126 and `@ai-sdk/openai-compatible` 3.0.62 (2026-09-30, Node >=22), `@tanstack/ai` 0.63.0 and `@tanstack/ai-openai` 0.25.1 (2026-09-27). These are research snapshots, not floating runtime dependencies.

Official sources:
- [OpenAI Node SDK README](https://github.com/openai/openai-node#readme), including supported Node 22/24 LTS and Bun >=1, custom baseURL/fetch, Chat Completions streaming, log levels and maxRetries/timeout.
- [OpenAI SDK package metadata](https://registry.npmjs.org/openai/7.25.0).
- [Vercel AI SDK](https://github.com/vercel/ai/tree/main/packages/ai), [compatible adapter metadata](https://registry.npmjs.org/@ai-sdk%2fopenai-compatible/3.0.62).
- [TanStack AI official README](https://github.com/TanStack/ai#readme), [core metadata](https://registry.npmjs.org/@tanstack%2fai/0.63.0), [OpenAI adapter metadata](https://registry.npmjs.org/@tanstack%2fai-openai/0.25.1). The website overview returned HTTP 403 in this environment; official GitHub/npm materials were used instead.

Selected exact `openai` 7.25.0 with application Zod 4 authoritative validation. It is maintained, explicitly supports both required runtimes, and provides a small compatible HTTP/SSE boundary without adopting chat/agent/tool/client concepts. The SDK package name does not require OpenAI service: explicit baseURL and optional authentication support compatible hosted/self-hosted endpoints. Chat Completions is the baseline rather than provider-specific Responses. Vercel's stable toolkit is viable but adds orchestration/abstraction surface unnecessary for one provider. TanStack AI is actively maintained and provider-agnostic but remains a pre-1.0 package; native TanStack app boundaries do not require its broader library API.

SDK defaults conflict with v1: two automatic retries, ten-minute timeout, warning logging and OPENAI_* env inheritance. Adapter explicitly disables retries/logging, uses canonical base URL/key/config only, filters outbound headers, rejects redirects and composes an abort deadline for the entire response body/stream. A private placeholder satisfies SDK constructor requirements on unauthenticated endpoints; no Authorization header is sent. Raw causes are dropped. A transport byte guard protects SDK parsing in addition to generated output bounds.

## Cross-framework v1 contract

These canonical facts come from the user prompt, not another implementation:

| Area | Shared observable v1 contract |
| --- | --- |
| Relationships | requires []; integratesWith jobs, object-storage, observability, audit-log; baseline node-runtime; external configured model provider only on operation |
| Enablement | defaultInstalled false; deliberately enabled root reference for CI; optional independent clean consumer |
| Provider | sole ID openai-compatible; compatible HTTP/model endpoint; never require OpenAI specifically; private provider adapter |
| Environment | AI_PROVIDER default openai-compatible; AI_MODEL required lazily, 1–128 printable characters, no inferred model; AI_API_KEY optional/server-only; AI_BASE_URL optional, standard upstream default, HTTPS except explicit localhost/test development; AI_TIMEOUT_SECONDS default 60, integer 1–300 |
| Input | 1–100 system/user/assistant text messages; each <=64 KiB UTF-8, total <=256 KiB; no empty/control/malformed role/content or multimodal/tool-result parts |
| Controls | optional temperature 0–2 inclusive; maxOutputTokens integer 1–65536; no arbitrary provider options |
| Text output | text, stop/length/content-filter/other finish reason, optional finite non-negative integer input/output/total token usage; no raw responses |
| Bounds | generated accumulated text <=1 MiB UTF-8; encoded structured response <=1 MiB |
| Structured | provider completion then JSON parse then authoritative application-owned Zod validation; never partial/arbitrary JSON success |
| Streaming | real incremental text-delta events; exactly one successful finish; same accumulated bound; failure throws safe AI error; consumer cancellation cleans up provider/network resources |
| Timeout/cancellation | complete provider request deadline 60 seconds/default or configured 1–300 seconds; caller AbortSignal composes; timeout and cancellation abort real work |
| Retries | zero automatic/hidden retries; application/Jobs policy owns billing, duplicated generation, rate-limit/idempotency |
| Errors | configuration, authentication, rate-limit, timeout, unavailable, invalid-request, invalid-output, cancelled, unknown; code, defensible retryable and static message only; no raw SDK/body/key/prompt/generated/header/secret URL leakage; internal causes never automatic log/serialize |
| Privacy | core has no Observability dependency; optional application safe wrapper only operation generate/stream/structured, bounded provider ID, outcome, seconds duration, valid numeric usage, finite finish reason; no default model metric label, content/key/raw exchange/user/arbitrary identifiers; telemetry failure never changes behavior |
| Startup | no model/provider network on import/build/normal startup/health/readiness/worker; validate lazily on use; all AI variables may be absent |
| Removal | stop call sites; remove app adapter/config/provider secrets/optional job/observability wiring/reference enablement; no database migration; never automatically delete/revoke external accounts/credentials; authoring-source pruning separate |

## Framework-native choices and limits

Server `.server.ts` primitives are called by explicit TanStack server functions/routes or server-side applications; demonstration is a CLI server smoke instead of a chat product or public endpoint. Independent custom add-on uses the pinned official TanStack CLI. Root `src/lib` instrumentation does not enter assets. SDK-specific JSON-object request format is internal; Zod is authoritative. Callers instruct JSON in messages and compatible providers must support JSON-object format. No native extra adapter/tool/MCP/search feature is included.

This implementation counts printable model IDs by Unicode code point and treats tab/CR/LF as appropriate text controls. Local HTTP is allowed only on loopback with explicit development/test mode; URL credentials/query/fragment are rejected. Retryable is true only for rate-limit/unavailable. Valid usage uses safe integers, a subset of finite non-negative integers. A 32 MiB transport-envelope guard prevents unbounded SDK JSON/SSE parsing. These are explicit implementation constraints; no unavoidable framework-specific difference in the canonical behavior was identified.

## Verification evidence

The deterministic local HTTP fixture uses the actual pinned SDK and real TCP sockets, not a mocked adapter. It verifies regular/byte-boundary completion, incremental SSE with delayed chunks and usage tail, structured/invalid JSON, malformed schema, 401/429/503/400, no retries, malformed usage omission, stalled headers/body, stream failures, pre-abort/caller cancellation/early return/pending next return, oversize structured/text/stream and real peer disconnection. Backendless tests cover canonical input/config bounds and safe error serialization/inspection. Reference fixture tests inject throwing telemetry and assert only safe finite metadata.

Clean lifecycle proves no database/auth/jobs/storage/observability/audit add-on dependency, backendless build and runtime removal/rebuild without provider account changes. Root checks and generic lifecycle/container/hosted CI results are reported at handoff; do not infer successful verification from metadata alone.
