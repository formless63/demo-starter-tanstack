# TanStack Launchpad

A polished, provider-neutral TanStack Start evaluation starter: React, strict TypeScript, PostgreSQL/Drizzle, OAuth-only Better Auth, and an authenticated Projects vertical slice.

## Stack and prerequisites

Use Bun 1.4.2, Node 24 LTS (production output), Docker with Compose, and optionally a GitHub OAuth app or OIDC provider. Versions are pinned through `mise.toml`, `package.json`, and `bun.lock`.

## Setup

```bash
cp .env.example .env.local
bun install --frozen-lockfile
docker compose up -d postgres
bun run db:migrate
bun run dev
```

The development database defaults in `.env.example` match Compose. Production starts fail closed unless `DATABASE_URL`, a non-default 32+ character `BETTER_AUTH_SECRET`, and a non-localhost `APP_BASE_URL` are explicitly configured. Environment validation separates unprefixed server secrets from the only browser-visible setting, `VITE_APP_NAME`.

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
bun run capabilities:check
bun run lint
bun run typecheck
bun test
bun run test:e2e
bun run check
```

Playwright covers the public landing page and anonymous protected-route redirect. CI runs the static, unit, build, and browser checks, then proves the production artifact by building the image, migrating a clean Compose PostgreSQL database through the containerized migration job, waiting for the application healthcheck, and curling `/api/health`. Authenticated CRUD and cross-user isolation are enforced by owner predicates in every server query; live OAuth requires provider credentials.

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
