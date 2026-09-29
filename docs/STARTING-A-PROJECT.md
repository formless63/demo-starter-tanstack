# Starting a project

This guide answers: “I cloned this repository—how do I turn it into my application?”

Before removing anything, create a branch and run `bun run capabilities:status`. The root reference application deliberately enables Jobs and API Platform, but both are optional for clean generated consumers.

## Full/reference setup

Keep both capabilities when the application's likely shape benefits from background work and machine-facing APIs, or when you want the repository's complete reference paths intact.

```bash
cp .env.example .env.local
bun install --frozen-lockfile
docker compose up -d postgres
bun run db:migrate
bun run jobs:migrate
bun run jobs:doctor
bun run jobs:smoke
bun run api-platform:smoke
bun run dev
```

For production, apply both explicit migration jobs before starting `app` and `worker`, as documented in the README.

## Lean baseline

Remove only what you know the application does not need. Removing a capability from the application and pruning its reusable add-on authoring source are separate decisions.

The procedures below are intentionally manual because shared TypeScript may have accumulated application changes. They never drop PostgreSQL tables/schemas or rewrite an already-applied migration.

After each recipe:

```bash
bun install
bun run generate-routes
bun run capabilities:status
bun run capabilities:check
bun run typecheck
bun run build
```

Use `bun install --frozen-lockfile` for subsequent reproducible installs after committing the updated lockfile.

### Remove Jobs

First stop workers and prevent producers from adding new work. Decide whether queued jobs must be drained or archived.

Remove application integration:

1. Delete `src/integrations/jobs/`, including its tests.
2. Delete `scripts/jobs-worker.ts`, `scripts/jobs-migrate.ts`, `scripts/jobs-doctor.ts`, and `scripts/jobs-smoke.ts`.
3. Remove the four `jobs:*` scripts from root `package.json`.
4. Remove `pg-boss` when no other code imports it. Keep baseline `drizzle-orm` and `zod`.
5. Remove the `x-jobs-environment` anchor plus `jobs-migrate` and `worker` services from `compose.yaml`.
6. Remove the four Jobs bundle commands from `Dockerfile`.
7. Remove Jobs-specific main-job steps from `.github/workflows/ci.yml`: containerized Jobs migration/doctor/smoke, worker startup, and worker-running assertion. The catalog-driven clean add-on job can remain while authoring source remains.
8. Remove `jobs` from `referenceApplication.enabledCapabilities` in `capabilities/catalog.json`. Keep `defaultInstalled: false`.
9. Update README/deployment notes for an application-only Compose flow.
10. Run the verification commands above.

Retain the `pgboss` PostgreSQL schema and queued/history data by default. Application removal performs no database-destructive operation.

If this is a fresh, never-deployed project with no database worth retaining, you may separately choose to rebuild its initial database state. Do not make that cleanup part of the code-removal recipe. In an already-deployed application, dropping `pgboss` must be a new explicit operation/migration after backup and retention review.

If the downstream fork will never reinstall or develop Jobs, follow “Prune add-on authoring source” in [CAPABILITIES.md](CAPABILITIES.md): delete `capabilities/jobs/`, optionally delete `JOBS_MODULE_EVALUATION.md` and `.agents/skills/jobs-change/`, change the catalog entry to `deferred`, remove its implementation-only metadata, and update the roadmap. Keep the stable `jobs` ID because planned capabilities reference it.

### Remove API Platform

Revoke active API keys and stop machine clients before removing endpoints.

Remove capability-owned application files:

1. Delete `src/integrations/api-platform/`.
2. Delete `src/routes/api/v1/projects.ts`, `src/routes/api/openapi[.]json.ts`, `src/routes/docs.api.tsx`, and `src/routes/app.api-keys.tsx`.
3. Delete `scripts/api-platform-smoke.ts` and remove `api-platform:smoke` from root `package.json`.
4. Remove the API-specific Playwright test from `e2e/smoke.e2e.ts`, retaining the landing/protected-return test.
5. Remove the API keys navigation link and `IconKey` import from `src/routes/app.tsx`.

Review shared files manually:

6. In `src/lib/auth.ts`, remove the `@better-auth/api-key` import, remove `typeof apiKey` from the plugin union, and remove only the `plugins.push(apiKey({...}))` block. Preserve GitHub, generic OIDC, magic-link, and TanStack cookie configuration.
7. Keep the `apikey` table declaration in `src/db/schema.ts` by default so a later `db:generate` does not propose an accidental destructive drop. Keep the boolean `user.emailVerified` mapping.
8. Keep `drizzle/0001_pretty_kat_farrell.sql`, `drizzle/0002_even_nighthawk.sql`, and migration snapshots/journal. The first migration also corrects `email_verified` to Better Auth 1.7's boolean semantics; never blindly delete or reverse it.
9. Remove API Platform-only packages when unused elsewhere: `@better-auth/api-key`, `@scalar/api-reference-react`, `zod-openapi`, and development dependency `@scalar/openapi-parser`. Keep baseline Better Auth, Drizzle, Zod, TanStack, and Tabler packages.
10. Remove the production-container `/api/openapi.json` and `/docs/api` probes from `.github/workflows/ci.yml`. Keep `/api/health`.
11. Remove `api-platform` from `referenceApplication.enabledCapabilities` in `capabilities/catalog.json`. Keep `defaultInstalled: false`.
12. Regenerate `src/routeTree.gen.ts`, update the lockfile, and run the verification commands above.

The verified non-destructive recipe retains API-key rows and migration history. For a fresh, never-deployed project, you may instead regenerate a consolidated initial migration only if no database has ever applied the old files, while preserving boolean `email_verified` semantics. For any deployed application, dropping `apikey` requires a new explicit migration after credential-retention review; never edit or delete an applied migration.

If the downstream fork will never reinstall or develop API Platform, delete `capabilities/api-platform/`, optionally delete `API_PLATFORM_MODULE_EVALUATION.md` and `.agents/skills/api-contract-change/`, change its catalog entry to `deferred`, remove implementation-only metadata, and update the roadmap. Keep the stable `api-platform` ID because planned capabilities reference it.

### Remove both

Apply both recipes together, remove both IDs from `referenceApplication.enabledCapabilities`, regenerate routes once, and update/install dependencies once. Keep the baseline PostgreSQL migration history and `/api/health` container verification.

The resulting application retains TanStack Start/React, Bun, PostgreSQL/Drizzle, passwordless Better Auth, the authenticated Projects slice, Tailwind/shadcn/Tabler UI, Docker/Compose, CI, and agent/capability governance. `bun run capabilities:check`, `bun run typecheck`, and `bun run build` must all pass before treating the lean baseline as viable.

## Why there is no removal command

TanStack custom add-ons do not currently provide an uninstall transaction. Jobs is mostly additive, but API Platform edits shared Better Auth and Drizzle source that may already be customized. A generic deletion/codemod would either miss integration changes or overwrite application work.

The per-capability `CAPABILITY.md` files remain the technical source of truth; this guide is the user-facing sequence. No removal step automatically drops schemas, tables, or data.
