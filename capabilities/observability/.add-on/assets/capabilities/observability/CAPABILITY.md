# Observability capability

Status: done; optional (`defaultInstalled: false`). Enabled in the reference app for continuous verification. Evaluation: `docs/evaluations/OBSERVABILITY_MODULE_EVALUATION.md`.

## Requirements

**Requires:** No reusable capability. Baseline TanStack Start and a Node-compatible runtime with AsyncLocalStorage. No database, auth plugin, Jobs, or API Platform is needed for installation. Official add-on `dependsOn: []`: no additional baseline integration is technically necessary, so no official add-on ID is guessed or declared.

**Integrates with:** Jobs, API Platform, Object Storage, Email, Webhooks, Audit Log, AI, Cache / Coordination, Search, Realtime, Notifications, Import / Export, Organizations, Authorization, Feature Flags, Invoice Ninja, Stripe, Medusa, and Ops / Admin. Each is optional.

**External:** Optional OTLP-compatible destination. Without one, JSON logs, request IDs, safe exception capture, local spans, and build metadata work. No network exporters/readers are created without an endpoint.

**Conflicts:** None. Existing `src/start.ts` must be reviewed because the official asset-copy format does not merge customized middleware.

## Adds

### Dependencies

Pino 10.3.1; OTel API 1.9.0; stable core, AsyncLocalStorage context manager, resources, trace SDK, Node trace provider, and metric SDK 2.11.0; OTLP/HTTP JSON trace and metric exporters 0.222.0 from the matching upstream release. No `sdk-node`, blanket auto-instrumentation, OTel Logs, browser SDK, vendor SDK, or extra service.

### Environment

- `OTEL_SERVICE_NAME` defaults to `tanstack-app`.
- `OTEL_SDK_DISABLED=true` disables recording/export while keeping logs/context.
- `OTEL_EXPORTER_OTLP_ENDPOINT` is an optional base endpoint. The standard exporter appends `/v1/traces` and `/v1/metrics`.
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` / `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` override with full signal URLs.
- `OTEL_EXPORTER_OTLP_HEADERS` and standard signal-specific header overrides are collector credentials; never log them.
- `OTEL_TRACES_EXPORTER` / `OTEL_METRICS_EXPORTER` accept `none` or `otlp`. An endpoint activates the corresponding exporter unless `none` is set. Explicit `otlp` without an endpoint fails configuration rather than contacting localhost. Exporters use OTLP/HTTP JSON.
- `OTEL_RESOURCE_ATTRIBUTES` accepts standard comma-separated key=value resource attributes. Supply only safe deployment metadata; built-in service/version/revision/environment fields take precedence.
- `APP_VERSION`, `APP_REVISION`, `DEPLOYMENT_ENVIRONMENT` provide release metadata; version/revision default to `unknown`, environment falls back to `NODE_ENV`. No runtime Git is needed.
- `LOG_LEVEL` defaults to `info`. `LOG_REDACT_FIELDS` extends sensitive field names (comma separated, trusted operator configuration).

### Scripts

`bun run observability:smoke` proves redaction/context, spans, metrics, real OTLP traces/metrics, and bounded shutdown using a fixture-owned local HTTP receiver. Generic `add-ons:compile`, `add-ons:test`, and `add-ons:matrix` remain the authoring/CI path.

### Database/migrations

None. Installation and startup never change database state.

### Runtime processes

Runs inside the existing app process and, optionally, worker. Lazy initialization happens once per process; signal handlers flush/shut down app telemetry. A worker explicitly drains pg-boss before awaiting `shutdownObservability()`. Export timeout is 2 seconds; the shutdown/flush caller has a 4-second upper bound. Logs use synchronous stdout writes, with no asynchronous transport queue to drain.

### Compose/infrastructure

No collector service is added. Root Compose passes optional telemetry/release variables to app and worker. The database-backed `/api/health` contract remains HTTP 200 with `status: "ok"`, or 503 with `status: "unhealthy"`; safe metadata and named dependency status are additive. Clean installation does not overlay an application's health route or require PostgreSQL.

## Application API

Server-only `runtime.server.ts` exports `getLogger()`, `getRequestContext()`, `getRequestId()`, `withLogContext()`, `captureException()`, `withSpan()`, `getTracer()`, `getMeter()`, `serviceMetadata()`, `flushObservability()`, and `shutdownObservability()`.

```ts
getLogger().info({ projectId }, 'Project created')
await withSpan('projects.create', async () => createProject())
```

Messages must be static; log only reviewed, minimal fields. Recursive redaction is case/format insensitive, includes child bindings and arrays, omits bodies/headers/query/URL/payload/auth objects, and replaces recognized credential URLs/Bearer/PAT strings. Application-specific unknown secrets in free text cannot be reliably detected: do not interpolate user input. Error capture intentionally emits only a safe error type and generic message, without raw messages, causes, stacks, SQL, or user input. The same safe exception is recorded on the active span and marked error; public HTTP envelopes are unchanged.

Global supported Start middleware runs before native routes, SSR, and server functions. It accepts `X-Request-ID` matching `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`, otherwise generates a UUID; returns it in response headers and uses isolated async context for nested logs. Incoming W3C traceparent/tracestate is extracted; baggage is not collected. Logs gain active trace/span IDs. CSRF middleware remains explicitly enabled for server functions.

HTTP span/metric route labels come from an explicit finite list in `src/start.ts`; unmatched paths and server functions use fixed fallback labels. Add reviewed routes there when needed. Duration measures handler/response creation, not streamed-body consumption. Assets served before Start, browser execution, proxy/TLS failures, and errors after a streaming response starts are outside this boundary. There is no dependency on Nitro internals or automatic loader/function-specific tracing.

Metrics are request count/duration/error, API operation count/duration/auth failures, and job execution count/duration/failures. Dimensions are HTTP method, reviewed route/operation ID, status code, registered queue name, and fixed outcome. IDs, arbitrary URLs, payloads, and secrets never become labels.

Optional reference wiring: native project route handlers call `observeApi()` with the existing contract's operationId; API Platform assets remain independent. `scripts/jobs-worker.ts` passes `observeJob` through Jobs' optional execution hook, wrapping payload validation and the registered handler. Job ID/name correlate logs/spans; payloads are never logged. pg-boss enqueue-to-worker causal propagation is deferred: no hidden tracing fields are added to payloads. Workers create fresh consumer spans.

## Installation

1. Install the retained `capabilities/observability/add-on.json` through official TanStack CLI URL mechanics; no other add-on is pulled in.
2. Review/merge `src/start.ts` if it already exists, preserving existing middleware and server-function CSRF protection.
3. Configure safe service/release metadata. Leave OTLP endpoints unset for standalone operation.
4. Run `bun run observability:smoke`, normal types/build, and an HTTP request-ID probe.
5. Add optional API route wrappers or Jobs worker execution wiring explicitly in the consuming application. They are deliberately absent from independent add-on assets.
6. If wanted, configure `OTEL_EXPORTER_OTLP_ENDPOINT`, then independently choose `OTEL_TRACES_EXPORTER=otlp` and `OTEL_METRICS_EXPORTER=otlp`.

## Removal

Follow `docs/STARTING-A-PROJECT.md`: remove middleware registration, route/health wrappers, worker wiring, owned source/smoke/tests, telemetry package additions and environment pass-through, then remove reference enablement. Preserve CSRF middleware and all original Jobs/API/auth/database behavior. No migrations or persisted telemetry data are owned by this capability. Keeping/pruning add-on authoring source is a separate choice; the CLI provides no automatic uninstall transaction.

## Upgrade considerations

Keep SDK/exporters aligned to the upstream compatibility release. Recheck middleware request/response semantics, server-only bundling, Pino child bindings, exporter timeouts/shutdown, semantic conventions, and fixed metric dimensions. Review redaction before expanding fields. Recompile retained assets after source changes. Browser telemetry remains a future extension because current OTel browser instrumentation is experimental; no replay/analytics is included.

## Verification

Run `bun run observability:smoke`, `bun run capabilities:check`, `bun run capabilities:status`, `bun run add-ons:test observability`, all existing add-on fixtures, root types/tests/build/E2E, and the production-container path. Root integration tests prove actual Jobs dispatch and existing machine API 401/403/429 behavior; telemetry smoke proves signal data and export. The add-on fixture needs no database/backend. Verify documented removal in a disposable copy.

## Agent guidance

Use `.agents/skills/capability-change/SKILL.md` and `.agents/skills/observability-change/SKILL.md`. Keep backendless operation and optional integrations, preserve safe capture and CSRF, bound metric cardinality and shutdown, update fixtures/contracts/evaluation together, and never expose telemetry secrets to client bundles.
