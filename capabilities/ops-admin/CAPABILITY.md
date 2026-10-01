# Ops / Admin v1

Status: in progress. Independent opt-in add-on; defaultInstalled is false. The reference wires explicit adapters. Verification remains a prerequisite to done.

## Access and contract

Native `/admin/ops` and GET `/api/ops/summary` require a currently valid baseline Better Auth human session on every loader/server-function/API request. API keys and organization roles do not authorize Ops. `OPS_ADMIN_USER_IDS` is a privileged platform-wide summary allowlist, server-only and empty by default. Comma-separated IDs are trimmed/deduplicated, blanks ignored; at most 100 distinct IDs, each nonempty opaque string of at most 128 UTF-16 units without controls. Invalid configuration fails Ops closed without blocking unrelated startup. No email/localhost/signup bypass. An application-owned guard may explicitly narrow membership or replace it; replacement has no default grant. Independent assets use baseline auth and the allowlist without optional identity imports.

Denied API responses contain only `{code,message,retryable}` from a closed static map: unauthenticated 401, forbidden 403, configuration/unavailable 503, oversized result 413. The page redirects anonymous visitors to the existing login entry and renders accessible denial text for authenticated nonoperators. Responses are private, no-store with Vary Cookie. No prerendering or shared personalized cache.

A static application registry has at most 16 adapters with unique machine IDs (64 characters), plain titles (80), pure `isConfigured` and read-only `inspect({signal})`. Up to eight explicitly registered count names carry nonnegative safe integers. Returned data is copied into a closed schema; extra fields, provider errors and environment details never reach responses. Summary `{checkedAt,adapters}` preserves registry order; cards contain id/title/status/checkedAt, optional durationMs/counts/closed code. UTC ISO timestamps use milliseconds. Status is ok/degraded/unavailable/not-configured/timeout. Encoded JSON is capped at 64 KiB. No query target/filter or arbitrary URL.

## Bounds and cancellation

No inspection on import, build, startup or health. Initial authorized request and manual Refresh only; duplicate refresh is disabled. Individual deadline 3000 ms, total 5000 ms, maximum three actual inspections per inspector/process. One pending inspection per adapter is reused across requests until settled, including rejected/hung optional work. Signal reaches adapters. Unsupported older Storage/Cache checks stop awaiting at the card deadline but do not pretend to cancel their I/O; hung work retains its slot and cannot multiply across refreshes. Rejection handlers are attached. No retries. Jobs abort closes its PostgreSQL socket; server-side statements remain independently bounded to two seconds. Optional failures remain individual cards and never affect readiness.

## Composition and privacy

Reusable assets import no optional capability. Root application owns `src/lib/ops-adapters.server.ts` and imports installed integrations. Jobs reads supported `getQueues(registeredNames)` cached metadata through a read-only connection without starting the producer, queue creation or force recount. The timestamp is unknown and explicitly labeled; counts are stale samples, not instantaneous state. Webhooks reports presence and refers to aggregate Jobs counts rather than inventing delivery persistence. Audit reports presence with counts omitted. Storage performs private bucket HEAD through application-owned createStorage with maxAttempts:1; ordinary Storage defaults stay unchanged; Cache performs existing PING only. Observability reports local export configuration only, with no collector request. No payload, event body, target, secret, bucket, endpoint, key, URL, environment value or session is rendered. Ops itself emits no logs; optional providers retain their own documented safe operation logging.

The clean scaffold overlays baseline auth/DB/env files because the official Better Auth demo defaults to passwords without persistence. Assets reuse password-disabled PostgreSQL/Drizzle session conventions and GitHub/OIDC providers; auth tables belong to the baseline, never Ops. Existing customized auth/schema/env files require manual reviewed composition; no generic semantic merge is claimed. The official foundation supplies Better Auth; the fixture verifies actual installed 1.7.7 before runtime.

## Installation, removal and persistence

Compile `bun run add-ons:compile ops-admin`; install with generic add-on tooling after selecting baseline better-auth/Drizzle. No new dependencies, migrations, table, worker, jobs, provider setup or durable telemetry. `OPS_ADMIN_USER_IDS` belongs only to server environment. The root reference enables the completed capability; generated consumers remain opt-in.

To remove an optional capability first remove its entry/import in application-owned ops-adapters and its helper if any. Then follow that capability's existing removal recipe. To remove Ops delete src/integrations/ops-admin, src/lib/ops.server.ts, src/lib/ops-adapters.server.ts, src/lib/ops-jobs.server.ts, src/lib/ops-storage.server.ts, src/routes/admin.ops.tsx and src/routes/api/ops/summary.ts; prune operator env and any application navigation, regenerate routes, typecheck/build/login/health. Keep the authoring workspace unless explicitly removing reusable source. No customer data, provider resources or migration history are cleaned up. This is an explicit file overlay/removal recipe, not a semantic uninstall transaction.

## Verification

`bun run ops:reference:removal` independently prunes each root optional adapter and its imports, then typechecks/builds an isolated copy. The generic clean consumer verifies retained human login/session and database health plus removed Ops route 404 after clearing generated state.

`bun run ops:unit` covers allowlist/session/guard boundaries, safe failures, missing configuration, registry validation, counts, isolation, deadlines and hung-work/concurrency limits. Generic clean-install fixture exercises baseline-only adapters and removal/rebuild. Real read-only canaries live in scripts/ops-jobs-fixture.ts (PostgreSQL cached metadata), scripts/ops-storage-fixture.ts (HEAD proxy with disposable storage:compat providers) and scripts/ops-cache-fixture.ts (PING/connection metadata through a disposable Valkey proxy). The baseline consumer runtime fixture explicitly migrates its own unique database and proves human session/operator boundaries before code removal. Browser, production and exact-head hosted CI run evidence is tracked in the draft PR; do not infer completion from unit tests.

Evaluation: [OPS_ADMIN_MODULE_EVALUATION.md](../../OPS_ADMIN_MODULE_EVALUATION.md).

The existing generic `add-ons:verify:reference` entrypoint discovers installed-path reference checks in lifecycle metadata. Root `bun test` invokes it through the capability-wave test, so hosted root verification covers Ops PostgreSQL/socket-abort, ordinary-vs-Ops Storage retries, real RustFS/Garage HEAD and Valkey PING canaries plus all six adapter-removal variants. Only explicit tests provision uniquely named local fixtures; application startup and independent consumer installation do not run these root composition checks.
