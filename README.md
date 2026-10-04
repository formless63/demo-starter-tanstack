# TanStack Start Full-Stack Starter

A deployable, provider-neutral TanStack Start and React starter with Bun, PostgreSQL/Drizzle, passwordless Better Auth, Tailwind CSS 4, shadcn conventions, Base UI where appropriate, Tabler Icons, Docker/Compose, CI, and optional reusable capabilities.

The root repository is also a reference application. It intentionally enables all twenty-nine completed capabilities so installation, integration, and production paths stay exercised; a clean generated consumer receives capabilities only when it explicitly selects them.

Acceptance verified on 2026-10-04: merged main `05fcf715483ef30bc56d5c1f40de77fed958baef` passed [all 31 hosted CI jobs](https://github.com/formless63/demo-starter-tanstack/actions/runs/37178672085), including the three identity capability lifecycles and the root application checks. Organizations, Authorization and Feature Flags are done, reference-enabled and opt-in (`defaultInstalled: false`). This records the tested implementation baseline; later changes still require their applicable checks.

## Start your application

Provide existing requirements, design artifacts and skill libraries, then ask your coding agent to **onboard this project** using the [onboarding workflow](docs/PROJECT-ONBOARDING.md). Review the proposed docs, capability choices, appearance and skill adaptations before approving customization. The [starting guide](docs/STARTING-A-PROJECT.md) retains manual setup and removal paths.

Versioned `.project` metadata describes downstream decisions; the reference remains uninitialized. `bun run project:check` and `project:status` validate/summarize it without network calls. [Appearance tooling](docs/APPEARANCE.md) safely vendors TweakCN/shadcn style JSON, generates semantic CSS, and supports persisted Light/Dark/System. It never executes a registry installer or silently downloads fonts. Bootstrap and appearance are baseline authoring tooling, not catalog capabilities. See [evaluation](docs/evaluations/PROJECT_BOOTSTRAP_EVALUATION.md) for contracts and verification.

## Why this starter

- Production-sensible defaults without a cloud-provider contract.
- Native TanStack routes and server functions instead of a second HTTP framework.
- Explicit, reviewed PostgreSQL migrations; startup never mutates schema.
- Passwordless authentication with verified-email account linking.
- A non-root Node production image and complete Compose release path.
- Independently installable TanStack custom add-ons for optional capabilities.
- PostgreSQL-backed tests, browser coverage, clean add-on fixtures, and container smoke verification.
- Compact agent guidance and machine-readable capability governance.

It is a strong starting point, not a claim that every application or hosting environment needs the same integrations.

## Base stack

The baseline is TanStack Start, React, strict TypeScript, Bun tooling, Node production output, PostgreSQL, Drizzle, Better Auth, GitHub OAuth, generic OIDC, Pocket ID development provisioning, Tailwind CSS 4, the shadcn-style component system, Tabler Icons, Docker/Compose, explicit migrations, CI/testing, and agent scaffolding.

Baseline components are not optional capability modules. Future integrations in [ROADMAP.md](ROADMAP.md) are plans, not installed features.

## Available capabilities

`defaultInstalled` means a clean base/generated consumer receives the capability without explicitly selecting or installing it. Completed capabilities are optional by that definition, while this reference application enables all of them.

| Capability | Status | Default | Hard requirements | Purpose | Contract |
| --- | --- | --- | --- | --- | --- |
| Ops / Admin | Done | Optional | Baseline Better Auth + Node runtime | Read-only operational overview, explicit safe adapters | [Ops contract](capabilities/ops-admin/CAPABILITY.md) |
| Jobs | Done | Optional | Baseline PostgreSQL + Drizzle | Typed pg-boss queues, explicit migration, worker, transactional enqueue | [Jobs contract](capabilities/jobs/CAPABILITY.md) |
| API Platform | Done | Optional | Baseline Better Auth + PostgreSQL/Drizzle + server runtime | User-owned machine keys, typed permissions, native v1 API, OpenAPI 3.1.1, Scalar | [API Platform contract](capabilities/api-platform/CAPABILITY.md) |
| Observability | Done | Optional | Baseline Start + Node runtime; no capability dependency | Safe JSON logs, request IDs, server traces/metrics, optional OTLP | [Observability contract](capabilities/observability/CAPABILITY.md) |
| Object Storage | Done | Optional | No database/auth/capability dependency; S3 when used | Private streaming, signed PUT/GET, multipart and post-upload verification | [Storage contract](capabilities/object-storage/CAPABILITY.md) |
| Command System | Done | Optional | None beyond baseline client | Accessible command palette, shortcuts, and caller-owned command execution | [Command contract](capabilities/command-system/CAPABILITY.md) |
| Markdown / Code Content | Done | Optional | None beyond baseline | Server-only bounded parsing/highlighting, native React rendering and accessible copy | [Markdown contract](capabilities/markdown-code/CAPABILITY.md) |
| Data Table | Done | Optional | None beyond baseline client | Typed native Table v9, controlled state and semantic accessible rendering | [Data Table contract](capabilities/data-table/CAPABILITY.md) |
| Charts / Visualization | Done | Optional | None beyond baseline client | Accessible SSR-safe line, bar, and area charts with data-table fallback | [Charts contract](capabilities/charts-visualization/CAPABILITY.md) |
| Rich Text / Tiptap | Done | Optional | None beyond baseline client | Bounded JSON, safe SSR, controlled editor and history boundaries | [Rich Text contract](capabilities/rich-text/CAPABILITY.md) |
| File UI | Done | Optional | Object Storage | Bounded private upload, durable scoped receipts and safe downloads | [File UI contract](capabilities/file-ui/CAPABILITY.md) |
| Flow / Canvas | Done | Optional | None | Controlled graph editing, semantic SSR and application-owned persistence | [Flow / Canvas contract](capabilities/flow-canvas/CAPABILITY.md) |
| PWA / Offline | Done | Optional | None | Integrity-checked public offline notice and safe worker lifecycle | [PWA contract](capabilities/pwa-offline/CAPABILITY.md) |
| Internationalization | Done | Optional | None | Request-local plain-text catalogs, CLDR plurals and canonical locale payloads | [Internationalization contract](capabilities/internationalization/CAPABILITY.md) |
| Email | Done | Optional | No database/auth/capability dependency; SMTP when used | Bounded SMTP delivery, safe errors and awaited magic links | [Email contract](capabilities/email/CAPABILITY.md) |
| Webhooks | Done | Optional | Jobs + baseline Node 24 | Standard Webhooks signing/raw verification, durable delivery and bounded retries | [Webhooks contract](capabilities/webhooks/CAPABILITY.md) |
| Audit Log | Done | Optional | Baseline PostgreSQL + Drizzle | Append-oriented events, bounded safe context, atomic domain writes, keyset queries | [Audit Log contract](capabilities/audit-log/CAPABILITY.md) |
| Cache / Coordination | Done | Optional | No capability dependency; Valkey on use | Ephemeral cache, atomic counters, advisory leases and pub/sub | [Cache contract](capabilities/cache-coordination/CAPABILITY.md) |
| AI | Done | Optional | Baseline Node runtime; model provider only on use | Bounded text, streaming and Zod structured generation | [AI contract](capabilities/ai/CAPABILITY.md) |
| Search | Done | Optional | Baseline PostgreSQL + Drizzle | Application-owned FTS, weighted generated vectors, safe queries and keyset pages | [Search contract](capabilities/search/CAPABILITY.md) |
| Realtime | Done | Optional | Baseline Node; human session integration | Authenticated SSE and WebSocket hints, bounded output; optional Cache fanout | [Realtime contract](capabilities/realtime/CAPABILITY.md) |
| Notifications | Done | Optional | Jobs + baseline PostgreSQL/Drizzle | Durable recipient-scoped in-app records, atomic delivery enqueue, optional Email/ntfy/hints | [Notifications contract](capabilities/notifications/CAPABILITY.md) |
| Import / Export | Done | Optional | Jobs + Object Storage; baseline PostgreSQL/Drizzle/Node | Scoped durable bounded CSV transfers and personal Projects round-trip | [Import / Export contract](capabilities/import-export/CAPABILITY.md) |
| Invoice Ninja | Done | Optional | Jobs + Webhooks | Approved unsent drafts, exact monetary projections and durable scoped reconciliation | [Invoice Ninja contract](capabilities/invoice-ninja/CAPABILITY.md) |
| Stripe | Done | Optional | Jobs + Webhooks | Hosted one-time Checkout, local status and durable scoped reconciliation | [Stripe contract](capabilities/stripe/CAPABILITY.md) |
| Medusa | Done | Optional | Jobs + Webhooks | Bound product/order Admin reads and durable subscriber-bridge reconciliation | [Medusa contract](capabilities/medusa/CAPABILITY.md) |
| Organizations / Tenancy | Done | Optional | Baseline Better Auth + PostgreSQL/Drizzle + Node | Guarded native administration and authoritative tenant context | [Organizations](capabilities/organizations/CAPABILITY.md) |
| Authorization | Done | Optional | Baseline Better Auth + PostgreSQL/Drizzle + Node | Exact-scope code roles, assignments and explicit resource policy | [Authorization](capabilities/authorization/CAPABILITY.md) |
| Feature Flags | Done | Optional | Baseline PostgreSQL/Drizzle + Node | Boolean definitions, exact overrides and deterministic cohorts | [Feature Flags](capabilities/feature-flags/CAPABILITY.md) |

See the [capability guide](docs/CAPABILITIES.md) for installation and removal semantics, and [ROADMAP.md](ROADMAP.md) for future architecture.

## Quick start

Use Bun 1.4.2, Node 24 LTS for production output, and Docker with Compose. GitHub OAuth or an OIDC provider is optional for initial local startup.

```bash
cp .env.example .env.local
bun install --frozen-lockfile
docker compose up -d postgres
bun run db:migrate
bun run jobs:migrate
bun run dev
```

The development database defaults in `.env.example` match Compose. Production starts fail closed unless `DATABASE_URL`, a non-default 32+ character `BETTER_AUTH_SECRET`, and a non-localhost `APP_BASE_URL` are explicitly configured. Environment validation separates unprefixed server secrets from the only browser-visible setting, `VITE_APP_NAME`.

## Starting a project

Choose the full reference setup to keep all completed capabilities continuously exercised, or follow the verified lean-baseline recipes to remove application integrations. Add-on authoring source can remain available or be pruned separately. See [Starting a project](docs/STARTING-A-PROJECT.md) for the exact shared-file edits and deployed-database cautions.

## Authentication

There is deliberately no password login.

### GitHub OAuth

Create a GitHub OAuth App with homepage `http://localhost:3000` and callback `http://localhost:3000/api/auth/callback/github`, then set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. GitHub works independently of OIDC.

### Generic OIDC

Set `OIDC_DISCOVERY_URL` to the issuer's OpenID discovery document plus `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`. Register `http://localhost:3000/api/auth/callback/oidc` and the application base URL for logout. The integration requests `openid profile email`, enables PKCE, and requires verified ID tokens.

For a development Pocket ID admin API, set `DEV_OIDC_ADMIN_URL`, `DEV_OIDC_API_KEY`, and `APP_BASE_URL`, then run:

```bash
bun run auth:provision
```

The command uses Pocket ID's current `/api/oidc/clients` and `/secrets` APIs, updates callback/logout URLs, creates a secret only when the ignored `.env.local` lacks one, and is safe to rerun. Missing or unavailable configuration produces a clear error. Optional `MAGIC_LINK_ENABLED=true` delivers links through configured SMTP in development and production; local development reads Mailpit rather than console output.

## Machine API and OpenAPI

API Platform is enabled in this reference application but remains optional for generated consumers. Human users manage PAT-style keys at `/app/api-keys`; new secrets are displayed once, while later lists contain only names, safe prefixes, permissions, state, expiration, and last-use metadata. Keys use the `X-API-Key` header, are hashed by Better Auth, never become browser sessions, and may receive `projects.read` and/or `projects.write`.

Version 1 defaults to no expiry, a 64-character generated key with the `app_` prefix, and 1,000 requests per 60 seconds. These operational limits can be overridden per key where appropriate without changing the public authentication contract.

The native TanStack routes `GET /api/v1/projects` and `POST /api/v1/projects` prove owner-scoped machine access to the existing Projects slice. The generated OpenAPI 3.1.1 document is available at `/api/openapi.json`, with interactive Scalar documentation at `/docs/api`. Run `bun run api-platform:smoke` against a migrated development database for the credential, permission, route, and contract smoke path.

## Development and migrations

`bun run dev` starts the app. Edit `src/db/schema.ts`, run `bun run db:generate`, review the SQL under `drizzle/`, and commit it. For local development, apply migrations with `bun run db:migrate`; schema push is intentionally not a script.

The Postgres-only development workflow remains:

```bash
docker compose up -d postgres
```

Targeting `postgres` does not build or start the application.

## Background jobs

The reusable jobs capability uses pg-boss with the same PostgreSQL database by default and a dedicated `${PGBOSS_SCHEMA:-pgboss}` schema. Queue names, payload schemas, policy, and handlers live in `src/integrations/jobs/registry.ts`; `starter.echo` is the minimal working example. Enqueue with `sendJob`. When an application write and enqueue must commit together, call `sendJobInTransaction` inside the same Drizzle transaction.

Runtime clients and workers always use `migrate: false`. Prepare and verify the schema explicitly, then start the worker:

```bash
bun run jobs:migrate
bun run jobs:doctor
bun run jobs:worker
```

`bun run jobs:smoke` starts a real worker, enqueues `starter.echo`, waits for its stored completion output, and exits nonzero on failure. `JOBS_CONCURRENCY` controls per-queue local concurrency. `PGBOSS_DATABASE_URL` can isolate jobs onto another PostgreSQL connection; otherwise `DATABASE_URL` is used. LISTEN/NOTIFY is opt-in through `PGBOSS_USE_LISTEN_NOTIFY=true`, with polling retained as the correctness fallback.

## Server observability

Observability is optional and works without a backend: Pino emits newline JSON logs with safe service/version/revision metadata; requests receive `X-Request-ID`, and nested logs include request/trace/span context. Incoming request IDs are accepted only when bounded and safe. Bodies, query strings, raw headers, job payloads, and auth/session objects are omitted; sensitive field names are recursively redacted, including child bindings. Use static log messages and small reviewed fields. Errors capture safe type/generic text rather than raw driver/auth messages or stacks.

OTLP/HTTP JSON export is opt-in:

```dotenv
OTEL_SERVICE_NAME=my-app
APP_VERSION=1.0.0
APP_REVISION=your-build-revision
DEPLOYMENT_ENVIRONMENT=production
OTEL_EXPORTER_OTLP_ENDPOINT=https://collector.example.com
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
# Optional collector credentials; keep out of Git/logs:
# OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer%20your-secret
```

Leave endpoints empty to avoid all network export. Set either signal exporter to `none` independently, or `OTEL_SDK_DISABLED=true` for both; logs and request IDs remain available. Root Compose passes these values to app/worker without requiring a collector service. Native API routes use stable operation IDs; workers wrap registered handlers and flush after draining jobs. Neither Jobs nor API Platform requires Observability. See the [contract](capabilities/observability/CAPABILITY.md) for API helpers, coverage limits, redaction extensions, and shutdown behavior, and [removal guide](docs/STARTING-A-PROJECT.md#remove-observability) for safe unwiring.

## Object storage

Private server-side S3 primitives provide streaming reads, writes/metadata, prefix pagination, bounded presigned PUT/GET, multipart, safe keys/errors and post-upload HEAD verification. No file UI, database, auth dependency, implicit bucket creation or readiness coupling is added. Storage remains unconfigured until used; AWS deployments retain normal endpoint and IAM credential-chain behavior.

`bun run storage:dev:rustfs` starts preferred RustFS 1.0.0; `bun run storage:dev:garage` starts alternate Garage 2.4.1. These separate development profiles explicitly bootstrap their bucket and localhost-origin CORS. Configure ignored `.env.local` using the [Storage contract](capabilities/object-storage/CAPABILITY.md#installation), then run `storage:check` / `storage:smoke`. `storage:compat` verifies the same real private presign, streaming, pagination, metadata, multipart and trusted/untrusted CORS contract on both providers in disposable stacks. Add `--garage-ui` to also verify optional Noooste Garage UI v0.13.0, the shared TanStack/Nuxt recommendation: third-party, operator/development-only, localhost-bound and not required for S3. Its privileged admin token stays server/operator-only; known development credentials must never be reused remotely. `storage:dev:down` retains development volumes.

Both starters share AWS SDK client/presigner 3.1143.0, GET + PUT presigning (600-second default; 30–3600 bounds), private objects, path-style by default for custom endpoints and normal AWS addressing otherwise, and an explicit credential pair or normal SDK chain. Region is strictly `STORAGE_REGION` → `AWS_REGION` → `AWS_DEFAULT_REGION` → error, never a guessed AWS region. Local helpers set their own explicit region. See [shared defaults](capabilities/object-storage/CAPABILITY.md#shared-cross-framework-defaults).

Presigned Content-Type headers must match exactly. Validate proposed metadata before signing and actual size/type after upload; signed PUT has no universal pre-ingest byte policy. Keep URLs/credentials out of logs, consume or close download streams, and authorize server-chosen keys in application code. Optional application-owned telemetry records only finite operation/outcome/duration dimensions. See [evaluation](docs/evaluations/OBJECT_STORAGE_MODULE_EVALUATION.md) for provider scope and limitations, and [removal](docs/STARTING-A-PROJECT.md#remove-object-storage) for non-destructive unwiring.

## Email

[Email](capabilities/email/CAPABILITY.md) is a lazy, server-only Nodemailer 10.0.13 SMTP primitive with explicit TLS modes, bounded structured messages and safe errors. It makes one delivery attempt and returns partial acceptance without blind retries. No database, auth, telemetry or Jobs dependency is installed for clean consumers.

Start optional loopback-only Mailpit v1.31.3 with `bun run email:dev:mailpit`; configure ignored local SMTP/From settings from the contract. `email:check` verifies without sending; `EMAIL_SMOKE_TO=person@example.test bun run email:smoke` sends one explicitly addressed message. `email:compat` verifies real SMTP/MIME and deterministic Chaos in disposable stacks. `email:dev:down` stops the temporary sink, which never relays.

`MAGIC_LINK_ENABLED=true` requires structurally complete Email settings and delivers awaited text/HTML links through SMTP in development and production. Links/tokens are never console-logged; retrieve local links from Mailpit. Disabled magic links leave Email unused/unconfigured. Root optional telemetry records only bounded operation metadata. Domain DNS/deliverability remains the operator's responsibility.

## Verification

```bash
bun install --frozen-lockfile
bun run capabilities:status
bun run capabilities:check
bun run webhooks:unit
bun run webhooks:smoke
bun run add-ons:test jobs
bun run add-ons:test api-platform
bun run add-ons:test observability
bun run add-ons:test object-storage
bun run storage:unit
bun run storage:compat
bun run api-platform:smoke
bun run observability:smoke
bun run lint
bun run typecheck
bun test
bun run build
bun run test:e2e
```

Playwright covers the public landing page, anonymous protected-route redirect, OpenAPI endpoint, machine-auth boundary, and Scalar rendering. CI runs the static, unit, build, and browser checks, then proves the production artifact by building the image, migrating a clean Compose PostgreSQL database, starting the worker/application, and probing health, OpenAPI, and docs. Authenticated CRUD and cross-user isolation are enforced by owner predicates in every server query; live OAuth requires provider credentials.

The catalog-driven Storage clean add-on job additionally proves Storage's backendless installation, both real provider suites and runtime removal. Main CI repeats both providers with optional telemetry and the actual Node production-image Storage entrypoint. Normal app health still works with no Storage configuration/service.

Email has a catalog-driven independent clean fixture. Main CI proves real Better Auth and production-image SMTP delivery, while normal production health also runs with Email unconfigured. Full SMTP/Docker tests remain task/CI checks, never agent-turn hooks.

## Capability/add-on development

Implemented custom add-ons live independently under `capabilities/<id>`. Each directory owns official `.add-on` source metadata/assets, capability-local TanStack authoring metadata, `CAPABILITY.md`, a clean-install fixture, and the retained compiled `add-on.json` distributable. Run `bun run add-ons:compile` after changing add-on source, then `bun run add-ons:test <id>` to install it through the official CLI into a disposable clean scaffold and build the result. The catalog drives both discovery and CI; planned capabilities do not have add-on workspaces and are not installed. No distributable is published externally yet.

Read [docs/CAPABILITIES.md](docs/CAPABILITIES.md) before installing or removing a capability. TanStack CLI currently has no automatic uninstall transaction for custom add-ons, and shared TypeScript files require review.

## Production containers

Compose defines PostgreSQL, explicit one-shot `migrate` and `jobs-migrate` jobs, the production `app`, and a separately restartable `worker`. All application services use the same `${APP_IMAGE:-tanstack-launchpad:local}` image built from the production Dockerfile. The image contains the Node-compatible TanStack Start output and bundled operational entrypoints; it runs as the unprivileged `node` user and has no source bind mounts.

Create a deployment `.env` (Compose reads this file automatically) and set at least:

```dotenv
BETTER_AUTH_SECRET=replace-with-a-random-secret-of-at-least-32-characters
APP_BASE_URL=https://app.example.com
APP_PORT=3000
```

Provider credentials remain optional for a smoke deployment. `DATABASE_URL` inside containers is constructed by Compose with the `postgres` service hostname and is never taken from a localhost value. `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`, `APP_PORT`, and `APP_IMAGE` can be overridden in `.env`.

`docker compose build` builds every buildable service; `docker compose build app` is the optimized form because `app` and `migrate` share one image definition. Build once, run the migration job, and only start the application after migration succeeds:

```bash
docker compose build app
docker compose up -d --wait postgres
docker compose run --rm migrate
docker compose run --rm jobs-migrate
docker compose run --rm worker node .output/jobs-doctor.mjs
docker compose up -d --wait app
docker compose up -d worker
curl --fail http://localhost:${APP_PORT:-3000}/api/health
```

Either migration command exits nonzero on failure, so stop the release and do not start or update `app` or `worker` unless both succeed. Long-lived process startup never runs migrations itself.

Operational commands:

```bash
# Follow production application logs
docker compose logs -f worker
docker compose logs -f app

# Stop containers but retain PostgreSQL data
docker compose down

# Stop containers and remove PostgreSQL data
docker compose down --volumes

# Build and release a new application revision with the same explicit gate
docker compose build # or: docker compose build app
docker compose run --rm jobs-migrate
docker compose run --rm migrate
docker compose up -d --wait app worker
```

For registries, set `APP_IMAGE` to the immutable image reference and use that same reference for `migrate`, `jobs-migrate`, `app`, and `worker`. The stack is plain Compose and remains deployment-provider neutral.

## Identity policy track

Native Better Auth organization administration is separate from application permissions. Tenant selection never shares personal Projects. Exact-scope policy unions code roles and retains owner predicates; boolean flags only control an innocuous panel. Explicit local operator demo commands live in `scripts/identity-demo.ts`; nothing seeds on startup. Independent clean consumer lifecycle, scoped reference, browser and production checks pass; hosted CI verifies the complete generic capability matrix. See [installation/removal](docs/STARTING-A-PROJECT.md#identity-policy-capabilities).

## Repository conventions

`AGENTS.md` is concise canonical agent context. [Agent automation](docs/AGENT-AUTOMATION.md) describes shared project hooks and normal client trust controls. Architecture, stack, and commands use progressive disclosure under `.agents/context`; narrow workflow skills and reusable prompts support cross-tool work. Reusable capability status and dependency governance live in `ROADMAP.md` and `capabilities/catalog.json`. Server-only dependencies belong behind server functions/routes, and authorization is always enforced next to the database mutation.

Webhooks provides a signed Standard Webhooks primitive with Jobs as its only hard capability dependency. See [Webhooks contract](capabilities/webhooks/CAPABILITY.md) and [evaluation](docs/evaluations/WEBHOOKS_MODULE_EVALUATION.md). Explicit `bun run webhooks:unit` and `bun run webhooks:smoke` use a disposable receiver; normal startup needs no external endpoint.

The Webhooks catalog fixture proves transitive Jobs installation, signed real HTTP delivery and worker retries, then removes Webhooks while retaining Jobs. Main CI also runs its Node production-image smoke; no receiver is needed for normal application health. CLI 0.71 custom dependency IDs require the generic local transport (`bun scripts/add-ons.ts serve webhooks`) rather than direct raw-JSON installation; external publication is deferred.

## Audit Log

Audit Log records Projects create/update/delete in the same Drizzle transaction as the mutation. Signed-in users map to stable user IDs; optional API wiring maps verified machine key IDs, never credentials. Context contains static source/field names, not project values or request/session dumps. The reusable primitive has no consumer capability dependencies, UI, tenancy, logging or retention automation. Run `bun run audit-log:smoke` against a migrated test database. See its [contract](capabilities/audit-log/CAPABILITY.md) and [evaluation](docs/evaluations/AUDIT_LOG_MODULE_EVALUATION.md) for metadata bounds, keysets, operator authority and privacy/removal responsibilities.

## Cache / Coordination

Optional server-only ephemeral cache, atomic counters, advisory leases and pub/sub, independently packaged as [cache-coordination](capabilities/cache-coordination/CAPABILITY.md). No database/auth/Jobs/Realtime/Observability requirement; lazy config means normal build/start needs no Valkey. No cache UI or automatic readiness dependency.

| Capability | Requires | Optional integrations | External | Default installed |
| --- | --- | --- | --- | --- |
| Cache / Coordination | None | Realtime, API Platform, Jobs, Observability | Valkey 9.1.2 / common Redis protocol subset | No |

Use `bun run cache:dev:valkey` for separate loopback ephemeral Valkey, configure server-only `CACHE_URL=redis://127.0.0.1:6379`, then `bun run cache:check` (PING only), `bun run cache:smoke` (unique prefix/exact cleanup), and `bun run cache:dev:down`. `bun run cache:compat` creates and tears down disposable real Valkey; `cache:unit` and `cache:telemetry` verify backendless behavior/safe optional signals. Values expire by default; advisory leases have no fencing/Redlock guarantees; pub/sub has no persistence/replay. See [evaluation](docs/evaluations/CACHE_COORDINATION_MODULE_EVALUATION.md) and [removal](docs/STARTING-A-PROJECT.md#remove-cache--coordination).

PostgreSQL 18 stores PGDATA under `/var/lib/postgresql/18/docker`; Compose mounts its named volume at `/var/lib/postgresql`. Existing installations using the previous `/var/lib/postgresql/data` mount must preserve/restore their actual anonymous-volume cluster before changing mounts. See [database volume migration](docs/POSTGRES-VOLUME-MIGRATION.md). `bun run db:persistence:test` verifies fresh named-volume data survives container recreation.

## AI

Optional lazy server-side OpenAI-compatible model access with text, real streaming, authoritative Zod structured output, 1 MiB output bounds and composed cancellation. No hard capability dependencies or model/configuration required at build/start/health/worker. Configure `AI_MODEL` only when calling an operation; optional `AI_BASE_URL`/`AI_API_KEY`, provider default `openai-compatible`, timeout default 60 seconds (1–300). No automatic retries or content telemetry. `bun run ai:compat` and `ai:reference:smoke` use only a disposable local HTTP fixture. See [contract](capabilities/ai/CAPABILITY.md), [evaluation](docs/evaluations/AI_MODULE_EVALUATION.md) and [removal](docs/STARTING-A-PROJECT.md#remove-ai).

## Search

[Search](capabilities/search/CAPABILITY.md) uses PostgreSQL 18 native FTS with explicit `simple`, weighted A name/B description, a stored generated Projects vector and GIN index. `searchProjects` is a session-scoped POST server function; every page enforces the existing owner predicate. Query 2–256 after trim, page25/max100, `ts_rank_cd(..., 32)` and descending rank/updatedAt/id keysets. Numeric result ranks are separate from exact database rank text retained in canonical cursors. No external service, universal search table, snippets, vector/semantic search or raw query telemetry.

Apply the new reviewed `drizzle/0004_search.sql` through the existing explicit migration path. `bun run search:smoke` verifies real PostgreSQL 18 with a disposable temporary table. The catalog fixture proves clean installation/removal and retained domain data/migration history. [Evaluation](docs/evaluations/SEARCH_MODULE_EVALUATION.md) and [removal guide](docs/STARTING-A-PROJECT.md) document the contract; removing code never deletes Projects or applied migrations.

Import / Export is completed: [contract](capabilities/import-export/CAPABILITY.md) and [evaluation](docs/evaluations/IMPORT_EXPORT_MODULE_EVALUATION.md). It requires Jobs + Object Storage; Notifications/Audit remain optional composition. Clean consumers remain opt-in.

Ops / Admin provides guarded read-only `/admin/ops` and `/api/ops/summary`, privileged server-only `OPS_ADMIN_USER_IDS`, explicit application-owned optional adapters, no persistence. See [capability contract](capabilities/ops-admin/CAPABILITY.md) for installation/removal and deadline limitations.

Invoice Ninja v1 is completed and reference-enabled; clean consumers remain opt-in. Its independent add-on includes scoped durable operations/receipts, native routes, approved unsent drafts, exact monetary projections and data-preserving removal. Pinned native-provider, lifecycle, browser and canonical production verification passed. Deployment-specific draft policy and financial certification remain outside this acceptance. See [contract](capabilities/invoice-ninja/CAPABILITY.md).

Stripe v1 is completed and reference-enabled for approved hosted one-time Checkout and scoped durable reconciliation. Jobs and Webhooks are required; clean consumers remain opt-in. Full combined lifecycle, browser, canonical container and worker verification passed using local protocol/persistence fixtures, without sandbox/live payments or financial certification. See [contract](capabilities/stripe/CAPABILITY.md).

Medusa v1 is completed and reference-enabled: optional bound product/order read reconciliation, Jobs + Webhooks required, clean consumers `defaultInstalled: false`. Native reference routes/UI and the pinned disposable Medusa 2.21.2 backend/subscriber bridge passed the generic lifecycle and combined production gates. No checkout/payment workflow or external deployment is certified. See [contract](capabilities/medusa/CAPABILITY.md). All twenty-nine completed capabilities remain opt-in for clean consumers.

Rich Text / Tiptap: completed, reference-enabled and opt-in. Bounded JSON editing, safe SSR and controlled state. [Contract](capabilities/rich-text/CAPABILITY.md).
File UI is completed and reference-enabled (opt-in, Object Storage only): [contract](capabilities/file-ui/CAPABILITY.md). Root `/app/files` and the durable adapter passed source hosted verification; generated consumers supply their own trusted identity and production metadata adapter.

## Combined content-module acceptance

Both independently reviewed source heads passed full hosted CI: Rich Text `4754559bba71c36c357325f9b4d1231d3808d0cf` ([24 jobs](https://github.com/formless63/demo-starter-tanstack/actions/runs/37034217024)) and File UI `73c442b9b8729e17c8cb30a6879d87da80f31c5b` ([24 jobs](https://github.com/formless63/demo-starter-tanstack/actions/runs/37036091357)). This combined integration retains their accepted runtime and all inherited gates. That combined integration is included in the accepted main linked in this document.

Flow / Canvas is completed, reference-enabled and remains opt-in. Its native React Flow client enhancement, semantic SSR graph, strict portable JSON and application-owned persistence contract are documented in [Flow / Canvas](capabilities/flow-canvas/CAPABILITY.md). `/flow-test` is the public synthetic reference; it stores no remote data. Its reviewed source passed full hosted CI; combined-head CI remains mandatory before merge.

Internationalization (completed, reference-enabled, opt-in): request-local native i18next/React, bounded plain-text catalogs, Arabic CLDR plurals, trusted Intl presets and SSR-safe initial formatting. `/i18n-test` demonstrates app-owned locale query/history and scoped RTL. See [contract](capabilities/internationalization/CAPABILITY.md).

## Flow / Canvas and Internationalization acceptance

Flow / Canvas source `a1a020cf7e75340e4f833c62db0d0b0e6b38d117` passed all 26 hosted jobs ([run 37051676575](https://github.com/formless63/demo-starter-tanstack/actions/runs/37051676575)); Internationalization source `d422d4b24d9ea4a5904870564041465d8e050ef2` passed all 26 hosted jobs ([run 37052978536](https://github.com/formless63/demo-starter-tanstack/actions/runs/37052978536)). Both sources and their composition were independently reviewed. The combined integration preserves accepted main ancestry, both exact source parents, runtime source bytes, authored/compiled parity, migrations and all inherited gates. That integration brought the catalog to twenty-five completed, reference-enabled capabilities; every generated-consumer default remains false. That integration is included in the current accepted main; the exact merged-main CI evidence is linked in this document.

## PWA / Offline acceptance

PWA / Offline is completed, reference-enabled and independently opt-in: public-only inert offline notice, native worker lifecycle and two-phase retirement. See [contract](capabilities/pwa-offline/CAPABILITY.md). There are now twenty-nine completed, reference-enabled capabilities; all generated-consumer defaults remain false.

Source `52f6fcb2309daad9b1474a1c2c313914f3403460` passed all 28 jobs in [hosted CI](https://github.com/formless63/demo-starter-tanstack/actions/runs/37066322525), including real Chromium root/scoped workers, credential omission, privacy boundaries, natural multi-tab updates, actual generated Start production lifecycle, owned retirement and final source-removed HTTP rebuild. That historical promotion is included in the accepted main linked in this document.
