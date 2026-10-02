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
- `src/integrations/email`: lazy bounded SMTP primitives; `src/lib/email.server.ts` owns optional telemetry and Better Auth awaits delivery.
- `src/integrations/webhooks`: exact raw-byte signing/verification and Jobs-backed delivery with application-owned targets/replay storage.
- `src/integrations/audit-log`: PostgreSQL append/query schema and safe context; root Projects mutations share the caller transaction.
- `src/integrations/cache`: ephemeral strings/bytes, atomic counters, advisory leases and pub/sub; optional application telemetry.
- `capabilities`: catalog governance plus one self-contained official TanStack custom add-on workspace per implemented capability. Each workspace owns `.add-on` source, `.cta.json`, `CAPABILITY.md`, a retained `add-on.json`, and a clean-install fixture.

Custom add-ons never share a root `.add-on` directory. `capabilities/catalog.json` is the discovery index used by the thin orchestration scripts and CI matrix; the official TanStack CLI remains the compiler and installer. Planned catalog entries have no workspace until implementation, so they are not implicitly installed.

The seventeen completed capabilities are Jobs, API Platform, Observability, Object Storage, Email, Webhooks, Audit Log, Cache / Coordination, AI, Search, Realtime, Notifications, Import / Export, Ops / Admin, Invoice Ninja, Stripe and Medusa. All are reference-enabled and remain opt-in for clean consumers.

`defaultInstalled` describes only clean generated consumers. The root reference application's intentionally integrated capabilities are listed separately in `referenceApplication.enabledCapabilities`; disabling an application integration does not require deleting the reusable add-on workspace or its stable catalog identity. Removal retains database data and committed migration history unless a separate destructive change explicitly says otherwise.

Prefer direct framework primitives and explicit checks. Do not add repository/service layers, another HTTP router, RBAC, or other speculative abstractions. API-key permissions are credential grants, not the future general Authorization capability. Background work belongs in the explicit `src/integrations/jobs` boundary: typed registry, Zod payload validation, pg-boss persistence, and standalone worker.

Root TypeScript excludes `.add-on/assets` templates; each clean fixture owns consumer verification. Keeping an add-on's authoring source must not force its runtime packages into a lean reference application after removal.

## Storage boundary

`src/integrations/storage` is additive server-only S3 primitive code; no DB/auth/Jobs dependency, file UI, public-serving policy or startup mutation. Credentials/config/client are lazy and private by default. Common helpers validate keys, metadata, TTLs and multipart lists; expose streaming bodies with explicit consumer ownership and safe errors with non-public causes. `src/lib/storage.server.ts` is the optional application-owned telemetry wrapper, excluded from independent assets.

`compose.storage.yaml` separately profiles pinned RustFS/Garage and optional third-party Garage UI. Explicit development bootstrap owns bucket/CORS/layout/key setup; normal readiness stays database-only. Clean fixtures test both providers and application removal without deleting remote data. Production endpoints/policies/TLS/credentials are operator-owned; browser presigning requires an externally reachable signed hostname.

## Email boundary

`src/integrations/email` owns lazy server-only SMTP configuration, bounded structured messages, safe errors and minimal magic-link rendering. No database/auth/Jobs/telemetry imports. Explicit TLS, no file/URL/raw/attachment resolution and no automatic retries; partial acceptance is a result. `src/lib/email.server.ts` is an optional app-owned telemetry wrapper. Better Auth awaits delivery, keeps hashed tokens and checks canonical origin; never logs links. Disabled magic links need no SMTP. Optional `compose.email.yaml` is a temporary loopback Mailpit sink with no relay; SMTP is not readiness.

## Production containers
`compose.yaml` is the provider-neutral production orchestration contract. `app` and `worker` run independently and never mutate schema during startup. The explicit one-shot `migrate` and `jobs-migrate` services gate application and pg-boss schema changes before either long-lived process starts. All four services use the same immutable image and Compose database hostname. The runtime image is unprivileged, contains no development bind mounts, and exposes the database-backed `/api/health` readiness signal.

## Agent automation

`AGENTS.md` and `.agents/skills` are canonical. `.agents/hooks` holds shared read-only context, minimal tool guards and cheap completion checks; `.claude`, `.codex` and `.gemini` contain client adapters. See `docs/AGENT-AUTOMATION.md` for trust and controls.

Webhooks owns server-only raw signing/verification and Jobs-backed delivery under src/integrations/webhooks. Domain schemas/targets live in src/lib/webhooks.server.ts and compose into the existing Jobs registry. Jobs is hard-required; no optional telemetry/API/Audit imports. No startup receiver or migration.

## Audit Log boundary

`src/integrations/audit-log` owns a generic PostgreSQL append/query primitive and schema. Projects create/update/delete pass their existing transaction to the required audit insert; root API wiring maps safe verified key IDs to machine actors. No payload/session/header copying, consumer imports, UI, tenancy, purge automation or database immutability claim. Query authorization belongs to applications. Keep schema registrations and applied migrations during removal.

## Cache boundary

`src/integrations/cache` owns lazy server-only ephemeral data/atomic counters/advisory leases/pubsub, with separate validated data/lease/channel namespaces and bounded inputs. No DB/Auth/Jobs/Realtime/API/Observability import. `src/lib/cache.server.ts` is optional application telemetry and shutdown wiring. Explicit tools own connection checks; startup and database readiness never contact Valkey. Separate `compose.cache.yaml` is loopback-only and non-persistent.

## Project bootstrap and appearance

Baseline authoring workflows live in project-onboarding/appearance-change skills and docs/PROJECT-ONBOARDING.md / docs/APPEARANCE.md. Version-1 `.project` JSON contracts are framework-neutral; catalog remains authoritative for capability status/dependencies and application enablement. The reference has no downstream profile. Existing material and approved proposals govern customization and reviewed canonical skill imports. Checks/status do not install capabilities.

`appearance/default-theme.json` is the reference normalized source; downstream `.project/theme.json` is vendored data. Explicit tooling generates dedicated `src/theme.css` and `src/appearance-policy.ts`, never registry installers, arbitrary CSS, assets or font downloads. React external-store subscriptions plus a trusted early head script own persisted/system-aware mode; no backend startup work. Nuxt's companion should retain native color-mode using the same conceptual contract, not this React store.

Canonical Project mutation input limits are 120 characters for trimmed names and 1000 for optional trimmed descriptions, shared by browser/server/API validation and OpenAPI. Existing PostgreSQL text columns and migrations remain unchanged. Jobs roles are explicit and handlers may consume native optional attempt context; doctor remains a separate structural-drift release gate.

## AI boundary

`src/integrations/ai` owns lazy server-only bounded generation/stream/structured primitives; sole SDK adapter is provider.server.ts. No Jobs/Storage/Observability/Audit dependency or provider startup/readiness network. `src/lib/ai.server.ts` owns optional safe metadata-only telemetry; reference CLI smoke is explicit and local. Caller/timeout/consumer cancellation abort transport; no automatic retries.

## Search boundary

`src/integrations/search` owns PostgreSQL FTS SQL/schema helpers, bounded query/cursor parsing, exact rank/time keysets and safe errors. Domain tables own searchable rows and authorization; no universal search_documents table. Projects weights name A/description B with explicit simple, STORED generated tsvector and GIN in new migration0004. The session-bound POST server function always applies owner equality. Explicit domain projections exclude vector internals from all Projects returns. No raw query logging/spans/labels, telemetry dependency, external service, extraction or vector search. Retain schema-only helpers, generated declarations and applied history on removal; index/column removal needs a new reviewed migration.

## Realtime and Notifications boundaries

`src/integrations/realtime/` provides bounded process-local publication, SSE and supported Nitro/H3 WebSocket adapters without Cache/auth/DB imports. Application-owned `src/lib/realtime-hub.server.ts` shares the process hub between Nitro and Start module runners; `src/lib/realtime.server.ts` owns human-cookie/exact-channel authorization and `server/routes/api/realtime/` owns adapters. Restart after event-registry edits. Optional `src/lib/realtime-cache.server.ts` uses one non-durable Cache fanout path with explicit subscriptions/recovery. No SSE id/replay; WS has no application commands/RPC.

`src/integrations/notifications/` owns application PostgreSQL schema, strict metadata/plain-text creation, recipient-scoped keyset/read-state queries and Jobs delivery composition. Jobs is its only hard capability edge; Email/Realtime/Audit/Observability/ntfy remain optional. The reference’s Project domain/Audit/notification writes share one transaction, followed by a best-effort ID-only hint after commit. Application Email adapter resolves current address and delegates exactly once to Email; ntfy/current topic configuration are resolved at execution. Payloads contain only notificationId/channel. Browser notification view refetches on connection/reconnection. Worker registry excludes auth/browser routing imports; root HTTP authorization stays in its separate server-only wrapper. Removal retains notification history/schema/migrations and Jobs.

## Import / Export

`src/integrations/import-export` owns scoped durable receipts, bounded CSV, existing Jobs/Storage composition and explicit reconciliation/purge. `src/lib/import-export.server.ts` owns the personal Project registry/current user authorization/Audit composition; routes authenticate before building context. No Organizations/Authorization imports or tenant selection authority. Keep receipt+domain writes in one locked transaction, snapshot transaction closed before S3, retained data/migration history on removal. Canonical contract: `capabilities/import-export/CAPABILITY.md`. The capability is done and reference-enabled; consumers remain opt-in. Changes require the full lifecycle/production/exact-head CI gate.

Ops / Admin provides guarded read-only `/admin/ops` and `/api/ops/summary`, privileged server-only `OPS_ADMIN_USER_IDS`, explicit application-owned optional adapters, no persistence. See [capability contract](../../capabilities/ops-admin/CAPABILITY.md) for installation/removal and deadline limitations.

Invoice Ninja is a completed, reference-enabled independent Jobs/Webhooks add-on. Root reference uses current user scope; clean composition denies absent application policy. Caller transaction variants share durable intent/receipts and Jobs. Draft policy/currency are trusted application seams; no native invoice currency_id assumption, automatic write replay, provider metadata ownership or startup network. Removal preserves application-owned schema/types and data.

## Stripe boundary

`src/integrations/stripe` owns a pinned operation-local official SDK transport, native Stripe signature verification, scoped server-owned bindings/local projections, immutable Checkout ledgers and durable inbox/Jobs processing. Explicit trusted server authorization/offer/redirect seams deny by default. Root `src/lib/stripe.server.ts` wires current local user owners into the existing Jobs registry; Auth stays root-only. Native `/api/integrations/stripe` routes and `/app/payments` compose the reference UI. Provider credentials/configuration are lazy; startup never contacts Stripe. Removal retains provider schemas/history and Jobs/Webhooks. The capability is completed and reference-enabled after full combined verification; no sandbox/live financial or operator deployment certification is implied.

Medusa v1 (completed and reference-enabled) uses `src/integrations/medusa` for bounded Admin GETs, explicit server-owned bindings, closed projections, existing Jobs composition and application-bridge.standard-webhooks-v1 receipts. Native Start routes and Better Auth reference wiring live in `src/lib/medusa-http.server.ts`; callbacks use a separate current binding authorization policy. Configuration is lazy; missing Medusa never blocks base startup. `bun run medusa:unit`, `bun run medusa:smoke`, `bun run add-ons:test medusa` verify local fixtures. Actual pinned Medusa 2.21.2 local Admin/subscriber compatibility is tested by `bun run medusa:compat`; no checkout or payment workflow is exercised. Preserve `0013_medusa_v1.sql`, `0014_medusa_receipt_conflicts.sql`, cumulative journal/snapshots and retained data on removal.

Combined provider migration metadata is final and cumulative: Invoice Ninja is journal index 8/snapshot 0008, Stripe indices 9–11/snapshots 0009–0011, and Medusa indices 12–13/snapshots 0012–0013. Baseline indices 0–7 remain unchanged. Preserve SQL, order, timestamps and snapshot links; filename prefixes are not journal indices. See `docs/CAPABILITIES.md` for exact filenames and branch-deployment cautions.

Markdown / Code Content: `src/integrations/markdown-code/markdown.server.ts` is explicitly server-only and has no application dependencies. Only whitelisted serializable nodes cross to `MarkdownContent`; no raw HTML/MDX/image fetch or untrusted code execution. Application functions own authorization and content retrieval. The `/markdown-test` route is root reference wiring, not an automatically installed add-on route.
