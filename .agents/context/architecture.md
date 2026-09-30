# Architecture

## Boundaries and flow
`src/routes` owns TanStack Router pages and HTTP handlers. UI calls typed TanStack Start server functions in `src/features`; those functions restore the Better Auth session, validate input, enforce ownership in SQL, and then access Drizzle. `src/db` is server-only persistence. Browser code must never import `src/db` or `src/lib/auth`.

External machine operations stay under `/api/v1` and are normal TanStack Start server routes. `src/integrations/api-platform` owns credential verification, the plugin-neutral principal, error envelopes, Zod operation metadata, and deterministic OpenAPI generation; it is not a router. Every operation explicitly consumes its contract and enforces API-key permissions beside the owner-scoped domain call. `/api/openapi.json` contains only registered external operations, and `/docs/api` renders that document with Scalar.

Authentication terminates at `/api/auth/$`. Better Auth persists users, accounts, and sessions in PostgreSQL. `/app` restores the current user in `beforeLoad` and redirects anonymous visitors. Every Projects query includes the authenticated `ownerId`; route protection alone is never authorization.

## Directories
- `src/routes`: route composition and API endpoints.
- `src/features`: vertical feature UI, validation, and server functions.
- `src/lib`: auth clients and small cross-cutting utilities.
- `src/db`: schema and connection.
- `drizzle`: reviewed, generated migration history.
- `scripts`: local operational tooling; no runtime imports.
- `src/integrations/jobs`: typed queue definitions, enqueue APIs, transaction adapter, and worker runtime.
- `src/integrations/storage`: private server-only S3 primitives, streaming bodies, safe keys/errors, presigning, multipart and HEAD verification; no persistence or auth model.
- `src/integrations/api-platform`: machine principals and permissions, lifecycle boundaries, external API contracts/handlers, errors, and OpenAPI generation.
- `src/integrations/observability`: server-only Pino safety/context and explicit OTel SDK/runtime, Start middleware, finite HTTP labels, optional API/Jobs wrappers. `src/start.ts` registers telemetry before explicit CSRF protection; request bodies/URLs/payloads are never implicit log input.
- `capabilities`: catalog governance plus one self-contained official TanStack custom add-on workspace per implemented capability. Each workspace owns `.add-on` source, `.cta.json`, `CAPABILITY.md`, a retained `add-on.json`, and a clean-install fixture.

Custom add-ons never share a root `.add-on` directory. `capabilities/catalog.json` is the discovery index used by the thin orchestration scripts and CI matrix; the official TanStack CLI remains the compiler and installer. Planned catalog entries have no workspace until implementation, so they are not implicitly installed.

`defaultInstalled` describes only clean generated consumers. The root reference application's intentionally integrated capabilities are listed separately in `referenceApplication.enabledCapabilities`; disabling an application integration does not require deleting the reusable add-on workspace or its stable catalog identity. Removal retains database data and committed migration history unless a separate destructive change explicitly says otherwise.

Prefer direct framework primitives and explicit checks. Do not add repository/service layers, another HTTP router, RBAC, or other speculative abstractions. API-key permissions are credential grants, not the future general Authorization capability. Background work belongs in the explicit `src/integrations/jobs` boundary: typed registry, Zod payload validation, pg-boss persistence, and standalone worker.

Root TypeScript excludes `.add-on/assets` templates; each clean fixture owns consumer verification. Keeping an add-on's authoring source must not force its runtime packages into a lean reference application after removal.

## Storage boundary

`src/integrations/storage` is additive server-only S3 primitive code; no DB/auth/Jobs dependency, file UI, public-serving policy or startup mutation. Credentials/config/client are lazy and private by default. Common helpers validate keys, metadata, TTLs and multipart lists; expose streaming bodies with explicit consumer ownership and safe errors with non-public causes. `src/lib/storage.server.ts` is the optional application-owned telemetry wrapper, excluded from independent assets.

`compose.storage.yaml` separately profiles pinned RustFS/Garage and optional third-party Garage UI. Explicit development bootstrap owns bucket/CORS/layout/key setup; normal readiness stays database-only. Clean fixtures test both providers and application removal without deleting remote data. Production endpoints/policies/TLS/credentials are operator-owned; browser presigning requires an externally reachable signed hostname.

## Production containers
`compose.yaml` is the provider-neutral production orchestration contract. `app` and `worker` run independently and never mutate schema during startup. The explicit one-shot `migrate` and `jobs-migrate` services gate application and pg-boss schema changes before either long-lived process starts. All four services use the same immutable image and Compose database hostname. The runtime image is unprivileged, contains no development bind mounts, and exposes the database-backed `/api/health` readiness signal.
