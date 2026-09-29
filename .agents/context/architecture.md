# Architecture

## Boundaries and flow
`src/routes` owns TanStack Router pages and HTTP handlers. UI calls typed TanStack Start server functions in `src/features`; those functions restore the Better Auth session, validate input, enforce ownership in SQL, and then access Drizzle. `src/db` is server-only persistence. Browser code must never import `src/db` or `src/lib/auth`.

Authentication terminates at `/api/auth/$`. Better Auth persists users, accounts, and sessions in PostgreSQL. `/app` restores the current user in `beforeLoad` and redirects anonymous visitors. Every Projects query includes the authenticated `ownerId`; route protection alone is never authorization.

## Directories
- `src/routes`: route composition and API endpoints.
- `src/features`: vertical feature UI, validation, and server functions.
- `src/lib`: auth clients and small cross-cutting utilities.
- `src/db`: schema and connection.
- `drizzle`: reviewed, generated migration history.
- `scripts`: local operational tooling; no runtime imports.
- `src/integrations/jobs`: typed queue definitions, enqueue APIs, transaction adapter, and worker runtime.

Prefer direct framework primitives and explicit checks. Do not add repository/service layers, a separate API, RBAC, or other speculative abstractions. Background work belongs in the explicit `src/integrations/jobs` boundary: typed registry, Zod payload validation, pg-boss persistence, and standalone worker.

## Production containers
`compose.yaml` is the provider-neutral production orchestration contract. `app` and `worker` run independently and never mutate schema during startup. The explicit one-shot `migrate` and `jobs-migrate` services gate application and pg-boss schema changes before either long-lived process starts. All four services use the same immutable image and Compose database hostname. The runtime image is unprivileged, contains no development bind mounts, and exposes the database-backed `/api/health` readiness signal.
