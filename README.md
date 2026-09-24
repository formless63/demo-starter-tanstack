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

The development database defaults in `.env.example` match Compose. Generate a strong `BETTER_AUTH_SECRET` before any shared deployment. Environment validation separates unprefixed server secrets from the only browser-visible setting, `VITE_APP_NAME`.

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

`bun run dev` starts the app. Edit `src/db/schema.ts`, run `bun run db:generate`, review the SQL under `drizzle/`, and commit it. Deploy with `bun run db:migrate`; schema push is intentionally not a script.

## Verification

```bash
bun run lint
bun run typecheck
bun test
bun run test:e2e
bun run check
```

Playwright covers the public landing page and anonymous protected-route redirect. Authenticated CRUD and cross-user isolation are enforced by owner predicates in every server query; live OAuth requires provider credentials.

## Production and Docker

```bash
bun run build
bun run start
docker build -t tanstack-launchpad .
docker run --rm -p 3000:3000 --env-file .env tanstack-launchpad
curl http://localhost:3000/api/health
```

The multi-stage image builds with Bun and runs the framework's portable Node-compatible output on Node 24. Apply migrations as a separate release step. `/api/health` verifies database connectivity.

## Repository conventions

`AGENTS.md` is concise canonical agent context. Architecture, stack, and commands use progressive disclosure under `.agents/context`; five narrow skills and three reusable prompts support cross-tool workflows. Server-only dependencies belong behind server functions/routes, and authorization is always enforced next to the database mutation.
