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

Prefer direct framework primitives and explicit checks. Do not add repository/service layers, a separate API, queues, RBAC, or other speculative abstractions.

## Production containers
`compose.yaml` is the provider-neutral production orchestration contract. `app` runs the Node-compatible framework output and never mutates schema during startup. The explicit one-shot `migrate` service applies committed Drizzle SQL before an operator starts or updates `app`; both services use the same immutable image. Compose constructs their database URL with the `postgres` service hostname. The runtime image is unprivileged, contains no development bind mounts, and exposes the database-backed `/api/health` readiness signal.
