# Observability module evaluation

Capability #3 is complete: optional Pino application logs and explicit server OTel traces/metrics. No database/migration, required collector, SaaS SDK, or browser telemetry.

## Official sources and compatibility

Reviewed [OpenTelemetry JS status](https://opentelemetry.io/docs/languages/js/), [instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/), [exporters](https://opentelemetry.io/docs/languages/js/exporters/), [package compatibility](https://github.com/open-telemetry/opentelemetry-js/blob/v2.11.0/README.md), and the [paired upstream releases](https://github.com/open-telemetry/opentelemetry-js/releases). The matrix categorizes API/stable/experimental packages; its summary row still lists 2.0.x/0.200.x rather than each newer release. Exact 2.11.0 and experimental 0.222.0 releases share upstream commit `0b72a81636fa476e8f1f1afd2ae0c90a1362194c`; exporter manifests depend on stable 2.11.0 packages. That release metadata establishes the exact compatible set instead of independently choosing latest versions.

Pino 10.3.1 uses its official [API](https://github.com/pinojs/pino/blob/main/docs/api.md) and [redaction guidance](https://github.com/pinojs/pino/blob/main/docs/redaction.md). OTel API is 1.9.0; stable core/context-async-hooks/resources/sdk-trace/sdk-trace-node/sdk-metrics are pinned 2.11.0; trace/metric HTTP exporters are pinned 0.222.0. `sdk-trace` is the current stable package; `sdk-trace-base` remains a transitive Node-provider compatibility dependency. The new stable processor constructors take an options object, unlike the shim's legacy signature.

Lower-level SDKs provide explicit lifecycle control without experimental `sdk-node`. OTLP exporters still belong to the upstream experimental package line; document that honestly. OTel Logs remains development, so Pino owns canonical newline JSON logs. Manual instrumentation meets current needs without blanket auto-instrumentations-node.

## Request boundary and signal safety

[Start observability guidance](https://tanstack.com/start/latest/docs/framework/react/guide/observability) suggests middleware/manual spans; its automatic OTel integration remains future work. [Supported global middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware) offers a clean boundary now: `src/start.ts` registers instrumentation before explicit server-function CSRF protection. No Nitro internals are used.

AsyncLocalStorage isolates log context; OTel's Node context manager carries spans. A bounded safe incoming request ID is preserved, otherwise replaced by UUID; both Start response headers and returned responses carry it. W3C traceparent/tracestate is extracted without baggage. Static finite route names and fallback labels prevent URL-cardinality growth. Coverage is response creation, not body-stream completion; infrastructure/assets outside Start, post-stream errors, and browser execution are excluded. Application operations require explicit spans.

Pino serializers/hooks recursively redact named sensitive fields, including arbitrary nesting/arrays, and omit bodies, raw headers, URL/query, job payloads, full auth/session/user objects. A final stream hook also sanitizes child bindings because ordinary binding formatters do not cover every child record. This JSON parse/serialize pass trades some throughput for a uniform starter safety boundary; benchmark before high-volume adoption. Extend names through trusted `LOG_REDACT_FIELDS`. Static messages and reviewed fields remain mandatory: unknown secrets in arbitrary strings cannot be inferred. Errors emit only type/generic message, never raw messages/stacks/causes. The safe exception is also recorded on active spans; external API envelopes are preserved.

Metric dimensions are reviewed route/operation/queue names, HTTP method/status, and fixed outcome. IDs never become labels. HTTP duration uses the stable `http.server.request.duration` seconds convention and current HTTP attribute names; supplemental counters and application API/job instruments are deliberately small.

## Configuration, metadata, and lifecycle

Export is opt-in by explicit base or per-signal endpoint; no exporter/default localhost collector exists when absent. Traces/metrics independently honor `none`/`otlp`; explicit `otlp` without an endpoint fails configuration. Standard endpoints, headers, resource attributes and sampling configuration are used. HTTP exporters produce OTLP JSON. Logs/context/metadata remain useful without collectors or with SDK disabled. Safe service/version/revision/environment/runtime metadata comes from deployment variables and never needs Git in the runtime image. Root Compose passes configuration without adding a collector profile/service.

Initialization is once per process. Exporters have 2-second request/export timeouts; flush/shutdown callers have a 4-second bound with safe warnings. Normal worker shutdown drains pg-boss first, then awaits telemetry shutdown. Repeated shutdown is idempotent. App signal hooks flush telemetry; platform force-kill cannot guarantee delivery, and streaming requests are not a shutdown instrumentation contract.

## Optional integration and packaging

API Platform integration belongs in native project route call sites, using existing contract operation IDs. The reusable API assets and authentication/error/rate-limit contract stay independent. Jobs exposes an optional generic execution hook; the root worker passes `observeJob`, covering validation plus task execution. Reusable Jobs assets never import Observability. Echo payload logging was removed and default worker errors are generic to preserve the secret policy even on the standalone path.

Job logs/spans correlate ID and registered name; queue names alone become metrics. No documented pg-boss tracing envelope is required here, and public typed payloads are untouched. Enqueue-to-worker causal trace propagation is deferred; each worker task starts a consumer span. This is an explicit v1 limitation.

Official custom add-on source, metadata, environment declarations, owned implementation/smoke assets, retained distributable, and clean fixture live under `capabilities/observability`. `dependsOn: []` is accurate: Start's core plus Node context needs no Drizzle/Auth/Jobs/API add-on. Catalog reusable `requires: []` stays empty. Generic CI discovers the third completed add-on without a copied job.

The asset format overlays `src/start.ts`, so existing customized consumers must merge middleware explicitly. API Platform has a comparable shared-auth/schema caveat; Jobs is mostly additive. Before external publication, establish a supported shared-file merge/review story, benchmark logging overhead and request lifecycle behavior, decide retention/access policy for exported IDs, and broaden downstream Node deployment testing. Nothing is published externally by this change.

Removal unwires Start, health/API wrappers, worker adapter/shutdown, dependencies, environment, tests, and reference enablement. No schema/data changes are needed; keep CSRF and independent Jobs/API behavior. Authoring-source pruning remains separate. Browser OTel stays deferred because upstream browser instrumentation is comparatively experimental; no replay or analytics.

## Verification evidence

Frozen install, governance, lint/types, 26 root tests, production build, and three Playwright cases pass. All three official custom add-ons clean-install and build; Observability additionally typechecks its scaffold and proves signals/export without PostgreSQL or other add-ons. Actual worker success/failure and SIGTERM tests prove queue correlation and final trace/metric export without payload logging. Independent signal switches and absent configuration are tested, and an unavailable receiver cannot hang shutdown. Immutable redirect responses retain their status and request ID without being treated as failed spans. Empty deployment metadata correctly falls back to `NODE_ENV`; unexpected API fallback logs omit raw exceptions without changing the public envelope.

A fresh production Compose database is migrated through the image's intended one-shot paths; Jobs doctor/smoke, non-root app/worker startup, health/request-ID metadata, OpenAPI, and docs probes pass. Stopping that test database produces safe 503 readiness without SQL/credentials/stack, then health recovers. Documented removal was tested in a disposable copy with a fresh dependency install, governance/types/build, all 23 existing Jobs/API/base tests, and both existing browser cases. Root TypeScript excludes add-on template assets; fixtures own consumer type verification, so retained authoring assets do not force removed runtime packages back into a lean application.
