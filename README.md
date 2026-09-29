# TanStack Start Full-Stack Starter

A deployable, provider-neutral TanStack Start and React starter with Bun, PostgreSQL/Drizzle, passwordless Better Auth, Tailwind CSS 4, shadcn conventions, Base UI where appropriate, Tabler Icons, Docker/Compose, CI, and optional reusable capabilities.

The root repository is also a reference application. It intentionally enables every completed capability so installation, integration, and production paths stay exercised; a clean generated consumer receives capabilities only when it explicitly selects them.

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

`defaultInstalled` means a clean base/generated consumer receives the capability without explicitly selecting or installing it. Both completed capabilities are optional by that definition, although both are enabled in this repository's reference application.

| Capability | Status | Default | Hard requirements | Purpose | Contract |
| --- | --- | --- | --- | --- | --- |
| Jobs | Done | Optional | Baseline PostgreSQL + Drizzle | Typed pg-boss queues, explicit migration, worker, transactional enqueue | [Jobs contract](capabilities/jobs/CAPABILITY.md) |
| API Platform | Done | Optional | Baseline Better Auth + PostgreSQL/Drizzle + server runtime | User-owned machine keys, typed permissions, native v1 API, OpenAPI 3.1.1, Scalar | [API Platform contract](capabilities/api-platform/CAPABILITY.md) |

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

Choose the full reference setup to keep Jobs and API Platform continuously exercised, or follow the verified lean-baseline recipes to remove one or both application integrations. Add-on authoring source can remain available or be pruned separately. See [Starting a project](docs/STARTING-A-PROJECT.md) for the exact shared-file edits and deployed-database cautions.

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

The command uses Pocket ID's current `/api/oidc/clients` and `/secrets` APIs, updates callback/logout URLs, creates a secret only when the ignored `.env.local` lacks one, and is safe to rerun. Missing or unavailable configuration produces a clear error. Optional `MAGIC_LINK_ENABLED=true` prints links only in development; production intentionally refuses until a mail transport is implemented.

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

## Verification

```bash
bun install --frozen-lockfile
bun run capabilities:status
bun run capabilities:check
bun run add-ons:test jobs
bun run add-ons:test api-platform
bun run api-platform:smoke
bun run lint
bun run typecheck
bun test
bun run build
bun run test:e2e
```

Playwright covers the public landing page, anonymous protected-route redirect, OpenAPI endpoint, machine-auth boundary, and Scalar rendering. CI runs the static, unit, build, and browser checks, then proves the production artifact by building the image, migrating a clean Compose PostgreSQL database, starting the worker/application, and probing health, OpenAPI, and docs. Authenticated CRUD and cross-user isolation are enforced by owner predicates in every server query; live OAuth requires provider credentials.

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

## Repository conventions

`AGENTS.md` is concise canonical agent context. Architecture, stack, and commands use progressive disclosure under `.agents/context`; narrow workflow skills and reusable prompts support cross-tool work. Reusable capability status and dependency governance live in `ROADMAP.md` and `capabilities/catalog.json`. Server-only dependencies belong behind server functions/routes, and authorization is always enforced next to the database mutation.
