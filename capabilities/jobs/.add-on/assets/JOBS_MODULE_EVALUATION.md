# Jobs module evaluation (September 2026)

## Decision

The starter uses stable `pg-boss` 12.35.0 for PostgreSQL-backed background work. It reuses the existing database operational model, keeps deployment provider-neutral, and avoids a second datastore. Runtime application clients and workers explicitly set `migrate: false`; `jobs:migrate` is the only schema mutation path.

Jobs is a completed optional capability: `defaultInstalled: false` means a clean generated consumer must select it. The root reference application enables Jobs independently so installation, runtime, and production paths remain proven.

## Capability shape

- `src/integrations/jobs/registry.ts` is the typed source of truth for queue names, Zod payload contracts, retry/expiry policy, and handlers.
- `sendJob` validates before persistence. `sendJobInTransaction` uses pg-boss's official Drizzle adapter so a domain write and enqueue share one PostgreSQL transaction.
- `jobs:worker` registers every known queue, validates again at the worker boundary, applies configurable bounded concurrency, emits structured lifecycle logs, and drains gracefully on SIGINT/SIGTERM.
- `jobs:migrate`, `jobs:doctor`, and `jobs:smoke` are explicit operational gates. The smoke command exercises actual enqueue, worker consumption, completion state, and stored output.
- Compose runs `jobs-migrate` once and `worker` continuously from the same image revision used by the application.

## Verification evidence

The PostgreSQL integration suite proves both transaction outcomes: commit persists the project and job; deliberate rollback persists neither. A malformed payload sent below the typed API is rejected by the running worker and reaches failed state. Schema doctor reports installed version 43 with no drift, and the echo smoke completes through a real worker.

The custom add-on follows the current TanStack CLI metadata and compiled formats, declares package additions and scripts, and carries the reusable source plus the `jobs-change` skill. It now owns an independent authoring project under `capabilities/jobs`: `.add-on` source, capability-local `.cta.json`, retained `add-on.json` distributable, contract, and clean-install fixture. Its `dependsOn: ["drizzle"]` relationship uses the official TanStack CLI Drizzle add-on ID, because the Jobs transaction API requires a configured `#/db` integration rather than only the `drizzle-orm` package. The catalog-driven test invokes the official CLI against a clean disposable Start scaffold, verifies that Drizzle was actually resolved and configured for PostgreSQL, checks the installed Jobs payload and package metadata, and completes a production build.

The documented removal path was also verified against a disposable copy of the reference application. Removing Jobs code, scripts, the pg-boss package, worker/migration container wiring, and reference-app enablement still typechecks and builds. Removal deliberately retains the catalog/add-on authoring source and the `pgboss` database schema by default; pruning reusable distribution source or deleting queued data are separate decisions.

## Tradeoffs and extension points

Observability v1 adds one optional application-owned execution hook to `startJobsWorker`. It receives registered queue name/job ID and a closure that validates and executes the task; the root worker supplies telemetry, while independent Jobs assets import none. Echo payload logging and raw default error messages were removed. Real success/failure dispatch and worker drain followed by telemetry flush are verified, with no hidden tracing fields in payload schemas and no new hard dependency.

Queue registration is idempotent and occurs when a client or worker starts; schema migration never does. Polling is the safe default. LISTEN/NOTIFY remains opt-in because transaction-pooling proxies may not provide session-pinned connections. Adding a job requires one registry definition and handler, plus tests for validation and behavior. A dashboard, scheduler UI, and provider-specific process manager are intentionally out of scope.

Webhooks dependency verification adds optional native backoff/max-delay typing and a strict PostgreSQL Drizzle configuration asset: CLI 0.71 generated a possibly undefined URL which fails a full clean TypeScript check. Explicit config validation corrects the installed boundary without a Webhooks import or new runtime/migration behavior. Existing customized configs require reviewed merging.
