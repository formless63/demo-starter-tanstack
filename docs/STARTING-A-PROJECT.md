# Starting a project

This guide answers: “I cloned this repository—how do I turn it into my application?”

Before removing anything, create a branch and run `bun run capabilities:status`. The root reference application deliberately enables all completed capabilities, while generated consumers opt in independently.

## Full/reference setup

Keep the completed capabilities when their features fit the application, or when you want the repository's complete reference paths intact.

```bash
cp .env.example .env.local
bun install --frozen-lockfile
docker compose up -d postgres
bun run db:migrate
bun run jobs:migrate
bun run jobs:doctor
bun run jobs:smoke
bun run api-platform:smoke
bun run observability:smoke
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

### Remove Jobs and API Platform

Apply both recipes together, remove both IDs from `referenceApplication.enabledCapabilities`, regenerate routes once, and update/install dependencies once. Keep the baseline PostgreSQL migration history and `/api/health` container verification.

Observability, Object Storage and Email may remain independently installed; apply their following removal recipes for a capability-free application baseline.

The resulting application retains TanStack Start/React, Bun, PostgreSQL/Drizzle, passwordless Better Auth, the authenticated Projects slice, Tailwind/shadcn/Tabler UI, Docker/Compose, CI, and agent/capability governance. `bun run capabilities:check`, `bun run typecheck`, and `bun run build` must all pass before treating the lean baseline as viable.

### Remove Observability

1. Remove the Observability import/registration from `src/start.ts`, preserving `createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })` and other application middleware.
2. In `src/routes/api/v1/projects.ts`, remove `observeApi` and telemetry-only operation imports; restore direct `listProjectsApi(request)` / `createProjectApi(request)` calls.
3. In `src/routes/api/health.ts`, remove telemetry imports/capture/metadata and keep the original database check with `{ status: 'ok' }` or `{ status: 'unhealthy' }` and HTTP 503 on failure.
4. In `scripts/jobs-worker.ts`, remove Observability imports/init/flush; call `startJobsWorker()` with no execution hook and restore safe standalone lifecycle logs. In the Jobs integration test, remove `observeJob` and call `startJobsWorker()` directly. Keep Jobs' optional hook; it imports no telemetry package.
5. Delete `src/integrations/observability/` and `scripts/observability-smoke.ts`; remove `observability:smoke`, Pino, and the declared direct `@opentelemetry/*` additions from `package.json` when unused elsewhere.
6. Remove `x-observability-environment` and its app/worker merges from Compose, preserving `*jobs-environment`. Remove telemetry variables from application env examples. No service/database/migration deletion is needed.
7. Remove the explicit Observability smoke and request-ID container probe from main CI, and the request-ID/metadata E2E test plus the API test's request-ID assertion. Keep existing API/auth/health probes.
8. Remove `observability` from `referenceApplication.enabledCapabilities`. Keep authoring source/catalog status unless separately pruning it; use the standard `deferred` pruning recipe if needed.
9. Update the lockfile, regenerate routes, and run governance/types/tests/build and the production health path.

Apply this recipe alongside Jobs/API removal if none of those three are needed; apply Storage's recipe as well to remove all four; apply Email’s recipe to remove the fifth. No remaining application import should point at a removed integration. Observability authoring assets can remain independently installable even when the reference application no longer enables telemetry.

### Remove Object Storage

Stop producers/users of signed URLs first; account for outstanding URLs and multipart sessions. Application removal does not revoke issued URLs or dispose of remote data.

1. Delete `src/integrations/storage/`, `src/lib/storage.server.ts`, and `scripts/storage-*.ts` (including root-only reference/telemetry and fixture scripts).
2. Remove all `storage:*` package scripts and both `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` dependencies if unused elsewhere. Keep all baseline, Jobs/API/Observability packages.
3. Remove `STORAGE_*` entries from application env examples/local configuration and the Storage pass-through block in Compose. Never revoke or delete remote credentials as a side effect.
4. Remove `compose.storage.yaml` and `infrastructure/storage/` from the application. Stop these containers if desired, but retain named volumes by default; never delete remote buckets/objects. Backup/retention and later volume/data deletion are separate operator decisions.
5. Remove the reference two-provider telemetry smoke step from main CI and the two Storage bundle commands from Dockerfile. Keep catalog-driven authoring fixtures if retaining add-on source. No migration, database schema, readiness or auth change is needed.
6. Remove `object-storage` from `referenceApplication.enabledCapabilities`, retaining `defaultInstalled: false`. Update README/deployment notes and lockfile, then run governance/types/tests/build/E2E and normal production containers with no storage configuration.

Storage's optional wrapper is owned by `src/lib/storage.server.ts`; if removing Observability while keeping Storage, delete that wrapper, reference/telemetry scripts and telemetry-only unit case, remove `storage:reference:smoke`, and use standalone `storage:smoke` in compatibility CI instead. The reusable Storage integration imports no telemetry package and continues to work.

If abandoning authoring too, prune `capabilities/object-storage/`, `OBJECT_STORAGE_MODULE_EVALUATION.md`, and `.agents/skills/storage-change/`; retain the stable catalog ID as `deferred`, remove implementation metadata and update docs/roadmap. Removing code never authorizes deleting persisted objects or credentials. The clean-scaffold fixture applies runtime removal and rebuilds without AWS packages; reference removal is also verified in a disposable copy.

### Remove Email

1. Set `MAGIC_LINK_ENABLED=false` before removal. In `src/lib/auth.ts`, remove Email imports and the magic-link plugin block (plus its plugin-union/import entry), or deliberately replace delivery with another reviewed sender. Keep GitHub/OIDC/API-key/TanStack cookies. Never restore console-link logging. If removing the flow, restrict its server env schema to literal `false` so the existing client stays disabled.
2. Delete `src/integrations/email/`, `src/lib/email.server.ts`, `src/lib/email.test.ts` and `scripts/email-*.ts`. Remove `email:*` scripts, `nodemailer` and dev `@types/nodemailer` when unused elsewhere.
3. Remove SMTP/EMAIL settings from local/deployment environment and examples, plus their pass-through lines in Compose. Stop the optional local Mailpit stack before deleting `compose.email.yaml`; captured development mail is temporary. No provider account, remote credential, domain/DNS or database schema is removed.
4. Remove the two Email operational bundle commands from Dockerfile and the main CI SMTP/Chaos/auth/production smoke step. Keep all existing production health/Jobs/API/Storage verification and the catalog-driven fixture if retaining authoring source.
5. Remove `email` from `referenceApplication.enabledCapabilities`; keep `defaultInstalled: false`. Update README/docs and lockfile, run governance/types/tests/build/E2E and the no-SMTP production health path.

If keeping Email while removing Observability, remove the app-owned wrapper and `src/lib/email.test.ts`/`scripts/email-telemetry.ts`, change auth to use reusable `getEmail()` directly and remove only the telemetry assertion from the root smoke. Reusable Email and its clean fixture contain no Observability dependency.

For authoring pruning, additionally delete `capabilities/email/`, `EMAIL_MODULE_EVALUATION.md` and `.agents/skills/email-change/`, set the stable catalog ID to `deferred`, remove implementation metadata and update ROADMAP/docs. Keep the ID because future capabilities reference it. Clean installation/removal and reference-app removal are verified in disposable copies; no CLI uninstall transaction is claimed.

## Why there is no removal command

TanStack custom add-ons do not currently provide an uninstall transaction. Jobs is mostly additive, but API Platform edits shared Better Auth and Drizzle source that may already be customized. A generic deletion/codemod would either miss integration changes or overwrite application work.

The per-capability `CAPABILITY.md` files remain the technical source of truth; this guide is the user-facing sequence. No removal step automatically drops schemas, tables, or data.
