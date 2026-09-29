# Jobs module evaluation (September 2026)

## Decision

The starter uses stable `pg-boss` 12.35.0 for PostgreSQL-backed background work. It reuses the existing database operational model, keeps deployment provider-neutral, and avoids a second datastore. Runtime application clients and workers explicitly set `migrate: false`; `jobs:migrate` is the only schema mutation path.

## Capability shape

- `src/integrations/jobs/registry.ts` is the typed source of truth for queue names, Zod payload contracts, retry/expiry policy, and handlers.
- `sendJob` validates before persistence. `sendJobInTransaction` uses pg-boss's official Drizzle adapter so a domain write and enqueue share one PostgreSQL transaction.
- `jobs:worker` registers every known queue, validates again at the worker boundary, applies configurable bounded concurrency, emits structured lifecycle logs, and drains gracefully on SIGINT/SIGTERM.
- `jobs:migrate`, `jobs:doctor`, and `jobs:smoke` are explicit operational gates. The smoke command exercises actual enqueue, worker consumption, completion state, and stored output.
- Compose runs `jobs-migrate` once and `worker` continuously from the same image revision used by the application.

## Verification evidence

The PostgreSQL integration suite proves both transaction outcomes: commit persists the project and job; deliberate rollback persists neither. A malformed payload sent below the typed API is rejected by the running worker and reaches failed state. Schema doctor reports installed version 43 with no drift, and the echo smoke completes through a real worker.

The custom add-on follows the current TanStack CLI metadata and compiled formats, declares package additions and scripts, and carries the reusable source plus the `jobs-change` skill. Official CLI installation into a clean disposable project with the official Drizzle add-on succeeded, including dependency installation and a production build. Current upstream blank-scaffold Drizzle typing and Biome configuration mismatches are documented rather than attributed to this module.

## Tradeoffs and extension points

Queue registration is idempotent and occurs when a client or worker starts; schema migration never does. Polling is the safe default. LISTEN/NOTIFY remains opt-in because transaction-pooling proxies may not provide session-pinned connections. Adding a job requires one registry definition and handler, plus tests for validation and behavior. A dashboard, scheduler UI, and provider-specific process manager are intentionally out of scope.
