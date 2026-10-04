# Starting a project

This guide answers: “I cloned this repository—how do I turn it into my application?”

Before removing anything, create a branch and run `bun run capabilities:status`. The root reference application deliberately enables all completed capabilities, while generated consumers opt in independently.

Organizations, Authorization and Feature Flags have prepared candidate runtime wiring but remain **in-progress** with `defaultInstalled: false`. They are not yet in the accepted `referenceApplication.enabledCapabilities` list. Following the existing PWA acceptance sequence, reference enablement and `done` are promoted together only after the required verification. Source review, static checks and focused tests do not establish full integrated acceptance; lifecycle, backend, browser, production and exact-head CI evidence remain required. Fault-injection fixtures remain paused; no gate is waived.

## Recommended agent-led onboarding

1. Clone/generate the starter and reproduce dependencies.
2. Supply existing requirements, design documents/screenshots, migration material and skill libraries.
3. Ask the coding agent to **onboard this project**, following `.agents/skills/project-onboarding/SKILL.md` or the portable prompt.
4. Review inferred decisions, fill only remaining gaps, and inspect concrete document edits, capability plan, appearance/font choices and proposed skill imports/adaptations.
5. Approve the concrete plan. External skill imports/adaptations require explicit approval; hooks/MCP/settings/permissions are separate review.
6. Apply the selected capability state through existing installation/removal/pruning conventions and the approved semantic theme/policy through appearance tooling. Planned features stay deferred.
7. Run `project:check`, `project:status`, `theme:check`, capability checks/status and normal task verification. Resolve application enablement drift.
8. Begin feature implementation from the approved profile and authoritative documents.

See [PROJECT-ONBOARDING](PROJECT-ONBOARDING.md) for portable schemas, provenance and templates, and [APPEARANCE](APPEARANCE.md) for safe theme importing. Existing good SPEC/PRD/DESIGN filenames are preserved. The starter has no fake PROJECT/SPEC/DESIGN or real `.project/config.json`.

Manual setup remains supported. Use the recipes below, copy relevant `docs/templates/project/` templates only when needed, write schema-valid metadata if useful, and run the same deterministic checks. Agent onboarding is recommended, not mandatory.

## Full/reference setup

The reference retains all twenty-six accepted completed capabilities, including Flow / Canvas, Internationalization and PWA / Offline, and retains prepared runtime wiring for the three in-progress identity candidates. Candidate wiring is not an acceptance claim; complete the required verification before treating those modules as accepted reference integrations. Clean generated consumers still select capabilities explicitly (`defaultInstalled: false`). Provider credentials, trusted application policies and any remote setup remain operator-owned; completed local/CI verification is not financial or deployment certification.

```bash
cp .env.example .env.local
bun install --frozen-lockfile
docker compose up -d postgres
bun run db:migrate
bun run jobs:migrate
bun run jobs:doctor
bun run jobs:smoke
bun run webhooks:smoke
bun run api-platform:smoke
bun run observability:smoke
bun run dev
```

For production, apply both explicit migration jobs before starting `app` and `worker`, as documented in the README.

## Lean baseline

Remove only what you know the application does not need. Removing a capability from the application and pruning its reusable add-on authoring source are separate decisions.

The procedures below are intentionally manual because shared TypeScript may have accumulated application changes. They never drop PostgreSQL tables/schemas or rewrite an already-applied migration.

When deliberately changing the reference capability set in a downstream application, update or remove the root-only `src/integrations/capability-wave.test.ts` expectation. Keep the generic agent evaluation discovery and catalog matrix.

After each recipe:

```bash
bun install
bun run generate-routes
bun run capabilities:status
bun run capabilities:check
bun run project:check
bun run theme:check
bun run typecheck
bun run build
```

Use `bun install --frozen-lockfile` for subsequent reproducible installs after committing the updated lockfile.

### Remove Jobs

Remove or recompose every Jobs-dependent application integration first: Webhooks, Notifications, Import / Export, Invoice Ninja, Stripe and Medusa. Audit Log, Cache, Email, Storage and API Platform may remain independently installed.


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

If the downstream fork will never reinstall or develop Jobs, follow “Prune add-on authoring source” in [CAPABILITIES.md](CAPABILITIES.md): delete `capabilities/jobs/`, optionally delete `docs/evaluations/JOBS_MODULE_EVALUATION.md` and `.agents/skills/jobs-change/`, change the catalog entry to `deferred`, remove its implementation-only metadata, and update the roadmap. Keep the stable `jobs` ID because planned capabilities reference it.

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
9. Remove API Platform-only packages when unused elsewhere: `@better-auth/api-key`, `@scalar/api-reference-react`, `zod-openapi`, and development dependency `@scalar/openapi-parser`. Keep baseline Better Auth, Drizzle, Zod, TanStack, and Tabler packages. When pruning Scalar, also remove `@scalar/api-reference-react` from `vite.config.ts` client `optimizeDeps.include`; the remaining entries belong to baseline browser auth/validation.
10. Remove the production-container `/api/openapi.json` and `/docs/api` probes from `.github/workflows/ci.yml`. Keep `/api/health`.
11. Remove `api-platform` from `referenceApplication.enabledCapabilities` in `capabilities/catalog.json`. Keep `defaultInstalled: false`.
12. Regenerate `src/routeTree.gen.ts`, update the lockfile, and run the verification commands above.

The verified non-destructive recipe retains API-key rows and migration history. For a fresh, never-deployed project, you may instead regenerate a consolidated initial migration only if no database has ever applied the old files, while preserving boolean `email_verified` semantics. For any deployed application, dropping `apikey` requires a new explicit migration after credential-retention review; never edit or delete an applied migration.

If the downstream fork will never reinstall or develop API Platform, delete `capabilities/api-platform/`, optionally delete `docs/evaluations/API_PLATFORM_MODULE_EVALUATION.md` and `.agents/skills/api-contract-change/`, change its catalog entry to `deferred`, remove implementation-only metadata, and update the roadmap. Keep the stable `api-platform` ID because planned capabilities reference it.

### Remove Jobs and API Platform

Apply both recipes together, remove both IDs from `referenceApplication.enabledCapabilities`, regenerate routes once, and update/install dependencies once. Keep the baseline PostgreSQL migration history and `/api/health` container verification.

Webhooks must be removed before removing Jobs. Observability, Object Storage, Email, Audit Log, Cache and Search may remain independently installed; apply their following removal recipes for a capability-free application baseline.

The resulting application retains TanStack Start/React, Bun, PostgreSQL/Drizzle, passwordless Better Auth, the authenticated Projects slice, Tailwind/shadcn/Tabler UI, Docker/Compose, CI, and agent/capability governance. `bun run capabilities:check`, `bun run typecheck`, and `bun run build` must all pass before treating the lean baseline as viable.

### Remove Observability

1. Remove the Observability import/registration from `src/start.ts`, preserving `createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })` and other application middleware.
2. In `src/routes/api/v1/projects.ts`, remove `observeApi` and telemetry-only operation imports; restore direct `listProjectsApi(request)` / `createProjectApi(request)` calls.
3. In `src/routes/api/health.ts`, remove telemetry imports/capture/metadata and keep the original database check with `{ status: 'ok' }` or `{ status: 'unhealthy' }` and HTTP 503 on failure.
4. In `scripts/jobs-worker.ts`, remove Observability imports/init/flush; call `startJobsWorker()` with no execution hook and restore safe standalone lifecycle logs. In the Jobs integration test, remove `observeJob` and call `startJobsWorker()` directly. Keep Jobs' optional hook; it imports no telemetry package.
5. Remove application-owned Email telemetry (`src/lib/email.server.ts`) and Cache telemetry (`src/lib/cache.server.ts`, `scripts/cache-telemetry.ts`, `cache:telemetry` and its CI command); use the core Email/Cache clients directly.
6. Delete `src/integrations/observability/` and `scripts/observability-smoke.ts`; remove `observability:smoke`, Pino, and the declared direct `@opentelemetry/*` additions from `package.json` when unused elsewhere.
7. Remove `x-observability-environment` and its app/worker merges from Compose, preserving `*jobs-environment`. Remove telemetry variables from application env examples. No service/database/migration deletion is needed.
8. Remove the explicit Observability smoke and request-ID container probe from main CI, and the request-ID/metadata E2E test plus the API test's request-ID assertion. Keep existing API/auth/health probes.
9. Remove `observability` from `referenceApplication.enabledCapabilities`. Keep authoring source/catalog status unless separately pruning it; use the standard `deferred` pruning recipe if needed.
10. Update the lockfile, regenerate routes, and run governance/types/tests/build and the production health path.

Apply the relevant removal recipes for every unwanted capability; remove Webhooks before Jobs. No remaining application import should point at a removed integration. Observability authoring assets can remain independently installable even when the reference application no longer enables telemetry.

### Remove Object Storage

Stop producers/users of signed URLs first; account for outstanding URLs and multipart sessions. Application removal does not revoke issued URLs or dispose of remote data.

1. Delete `src/integrations/storage/`, `src/lib/storage.server.ts`, and `scripts/storage-*.ts` (including root-only reference/telemetry and fixture scripts).
2. Remove all `storage:*` package scripts and both `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` dependencies if unused elsewhere. Keep all baseline, Jobs/API/Observability packages.
3. Remove `STORAGE_*` entries from application env examples/local configuration and the Storage pass-through block in Compose. Never revoke or delete remote credentials as a side effect.
4. Remove `compose.storage.yaml` and `infrastructure/storage/` from the application. Stop these containers if desired, but retain named volumes by default; never delete remote buckets/objects. Backup/retention and later volume/data deletion are separate operator decisions.
5. Remove the reference two-provider telemetry smoke step from main CI and the two Storage bundle commands from Dockerfile. Keep catalog-driven authoring fixtures if retaining add-on source. No migration, database schema, readiness or auth change is needed.
6. Remove `object-storage` from `referenceApplication.enabledCapabilities`, retaining `defaultInstalled: false`. Update README/deployment notes and lockfile, then run governance/types/tests/build/E2E and normal production containers with no storage configuration.

Storage's optional wrapper is owned by `src/lib/storage.server.ts`; if removing Observability while keeping Storage, delete that wrapper, reference/telemetry scripts and telemetry-only unit case, remove `storage:reference:smoke`, and use standalone `storage:smoke` in compatibility CI instead. The reusable Storage integration imports no telemetry package and continues to work.

If abandoning authoring too, prune `capabilities/object-storage/`, `docs/evaluations/OBJECT_STORAGE_MODULE_EVALUATION.md`, and `.agents/skills/storage-change/`; retain the stable catalog ID as `deferred`, remove implementation metadata and update docs/roadmap. Removing code never authorizes deleting persisted objects or credentials. The clean-scaffold fixture applies runtime removal and rebuilds without AWS packages; reference removal is also verified in a disposable copy.

### Remove Email

1. Set `MAGIC_LINK_ENABLED=false` before removal. In `src/lib/auth.ts`, remove Email imports and the magic-link plugin block (plus its plugin-union/import entry), or deliberately replace delivery with another reviewed sender. Keep GitHub/OIDC/API-key/TanStack cookies. Never restore console-link logging. If removing the flow, restrict its server env schema to literal `false` so the existing client stays disabled.
2. Delete `src/integrations/email/`, `src/lib/email.server.ts`, `src/lib/email.test.ts` and `scripts/email-*.ts`. Remove `email:*` scripts, `nodemailer` and dev `@types/nodemailer` when unused elsewhere.
3. Remove SMTP/EMAIL settings from local/deployment environment and examples, plus their pass-through lines in Compose. Stop the optional local Mailpit stack before deleting `compose.email.yaml`; captured development mail is temporary. No provider account, remote credential, domain/DNS or database schema is removed.
4. Remove the two Email operational bundle commands from Dockerfile and the main CI SMTP/Chaos/auth/production smoke step. Keep all existing production health/Jobs/API/Storage verification and the catalog-driven fixture if retaining authoring source.
5. Remove `email` from `referenceApplication.enabledCapabilities`; keep `defaultInstalled: false`. Update README/docs and lockfile, run governance/types/tests/build/E2E and the no-SMTP production health path.

If keeping Email while removing Observability, remove the app-owned wrapper and `src/lib/email.test.ts`/`scripts/email-telemetry.ts`, change auth to use reusable `getEmail()` directly and remove only the telemetry assertion from the root smoke. Reusable Email and its clean fixture contain no Observability dependency.

For authoring pruning, additionally delete `capabilities/email/`, `docs/evaluations/EMAIL_MODULE_EVALUATION.md` and `.agents/skills/email-change/`, set the stable catalog ID to `deferred`, remove implementation metadata and update ROADMAP/docs. Keep the ID because future capabilities reference it. Clean installation/removal and reference-app removal are verified in disposable copies; no CLI uninstall transaction is claimed.

## Why there is no removal command

TanStack custom add-ons do not currently provide an uninstall transaction. Jobs is mostly additive, but API Platform edits shared Better Auth and Drizzle source that may already be customized. A generic deletion/codemod would either miss integration changes or overwrite application work.

The per-capability `CAPABILITY.md` files remain the technical source of truth; this guide is the user-facing sequence. No removal step automatically drops schemas, tables, or data.

### Remove Webhooks, keep Jobs

Stop webhook producers and coordinate worker deployment; decide whether existing deliveries should drain or be archived. Delete `src/integrations/webhooks/`, `src/lib/webhooks.server.ts`, `scripts/webhooks-*.ts`, the reference import/spread in `src/integrations/jobs/registry.ts` and any application-owned inbound processing definitions/routes. Keep the rest of the Jobs registry and its worker.

Remove `webhooks:*` scripts, the Webhooks smoke Docker bundle, WEBHOOK_REFERENCE_* env/Compose entries and any Webhooks-only dependencies when unused. Keep Jobs, pg-boss, Drizzle and baseline Zod. Remove `webhooks` from referenceApplication.enabledCapabilities when present. Retain queue history by default; do not automatically delete jobs or mutate/delete remote endpoints.

Run capability governance, types/build, Jobs smoke, E2E and production health. The clean fixture applies this removal, rebuilds and proves Jobs remains usable. To abandon authoring too, prune `capabilities/webhooks/`, evaluation and skill; keep stable catalog ID as deferred, remove implementation metadata, update roadmap/docs consistently. There is no CLI uninstall transaction.

### Remove Audit Log

1. In `src/features/projects/projects.server.ts`, remove Audit Log/identity imports, the optional actor argument/default from `insertProjectForOwner`, and the three `appendAuditEvent` calls. Domain transactions may remain. Preserve owner predicates, authentication and return/error behavior.
2. In root `src/integrations/api-platform/projects-api.server.ts`, remove `createAuditActor` import and the third argument from `insertProjectForOwner`. API Platform remains optional and independently packaged.
3. Delete `src/integrations/audit-log/audit.server.ts`, `validation.ts`, their tests, `src/features/projects/audit.integration.test.ts`, and `scripts/audit-log-smoke.ts`; remove `audit-log:smoke` from package scripts. Root has no Audit Log-only package/environment/service to remove. The fixture-only `audit-log-clean-fixture.ts` may be deleted in a generated consumer after verification.
4. **Retain** `src/integrations/audit-log/schema.ts`, its root `src/db/schema.ts` re-export (or installed config registration), `drizzle/0003_audit_log.sql`, snapshots/journal and table/data. A clean consumer retains its initial `0000_audit_log.sql` instead. Keeping schema registration prevents later generation from proposing a drop. Code removal does not authorize deletion of history.
5. Remove `audit-log` from `referenceApplication.enabledCapabilities`; update docs and run governance/typecheck/build/E2E. Independently packaged consumer fixtures remain usable without root integration.
6. To prune authoring too, delete `capabilities/audit-log/`, evaluation and skill if unused; retain the catalog ID as deferred and remove implementation metadata, using the standard pruning recipe. Other planned statuses stay unchanged.

Dropping deployed audit history requires a **new explicit destructive migration**, retention/privacy/backup decisions and operator review. Never delete/edit applied migrations. For a never-deployed fresh project only, consolidation may be a separate deliberate action. No v1 retention/purge automation exists. To reach the capability-free lean baseline, apply each completed capability’s removal recipe, removing Notifications and Webhooks before Jobs.

### Remove Cache / Coordination

1. Stop cache producers, subscriptions and advisory work; call `closeCache()` / `closeApplicationCache()` on shutdown. Account for in-flight leases expiring; Cache is ephemeral and owns no durable data.
2. Delete `src/integrations/cache/`, `src/lib/cache.server.ts`, and `scripts/cache-*.ts`; remove all `cache:*` scripts and `redis` if unused elsewhere. Independent Jobs/API/Realtime/Observability behavior remains unchanged.
3. Remove `CACHE_*` application env entries and `compose.cache.yaml`. `bun run cache:dev:down` disposes only the development ephemeral stack before removing tooling; do not flush/delete any remote service. Normal Compose has no Cache wiring.
4. Remove the explicit Cache compatibility/telemetry step from main CI. The catalog-driven authoring fixture can remain while source is retained. Remove `cache-coordination` from `referenceApplication.enabledCapabilities`, keeping `defaultInstalled: false`.
5. Update lockfile/docs and run governance, types/tests/build/E2E and production startup without Cache configured. No migrations/schema/UI/readiness edit is required.

If keeping Cache but removing Observability, delete only `src/lib/cache.server.ts` and `scripts/cache-telemetry.ts`, remove `cache:telemetry` and its CI command, and use core `getCache()` directly. Reusable Cache assets import no Observability.

Authoring pruning is separate: remove `capabilities/cache-coordination/`, `docs/evaluations/CACHE_COORDINATION_MODULE_EVALUATION.md`, `.agents/skills/cache-change/`, and retain the stable catalog ID as `deferred` without implementation metadata; update ROADMAP/docs. TanStack provides no automatic uninstall transaction. The clean fixture proves runtime removal and rebuild without Redis packages or a service.

Cache callers explicitly decode Buffer reads, use setWithoutExpiry only deliberately, and own close() for manual createCache instances. Lease TTLs are seconds (2–300), stale token results are false. Recreate subscriptions after failure; commands reconnect only on later explicit operations. No backend deletion is part of removal.

## Remove AI

Stop AI callers and optional application Jobs/Storage/Audit/Observability integrations. Remove `src/integrations/ai`, `src/lib/ai.server.ts`, `src/lib/ai.test.ts`, `scripts/ai-*.ts`, package `ai:*` scripts and `openai`. Retain Zod if shared. Remove AI environment/secrets/operator config and the Dockerfile AI smoke bundle line; remove `ai` from reference enablement. No database/data migration exists. Never automatically revoke/delete external provider credentials/accounts. Retain authoring workspace/skill/evaluation by default; pruning is a separate catalog/doc change. Run capability/agent checks, types/tests/backendless build and production startup/health/worker. The independent clean scaffold tests runtime removal and rebuild via `bun run add-ons:test ai`.

To add AI to a lean generated consumer, explicitly select `capabilities/ai/add-on.json` using the official CLI. Set server-only `AI_MODEL` on first operation; compatible HTTPS `AI_BASE_URL` and authentication `AI_API_KEY` are optional. Start with the local `ai:compat` fixture; it never needs external credentials. Call core from server-side application code, or own a safe telemetry wrapper; review endpoint trust and application retry/billing decisions.

### Remove Search

1. Remove Search helper/validation imports and the Search-only Drizzle `sql` import, plus `searchProjectsForOwner` / `searchProjects` from `src/features/projects/projects.server.ts`. Remove only the Search POST server function in `projects.functions.ts`. Keep authentication, owner predicates, the explicit project field projection and all domain mutations.
2. Delete `src/integrations/search/search.server.ts`, `validation.ts`, Search tests, `src/features/projects/search.integration.test.ts`, and `scripts/search-smoke.ts` / fixture-only `search-clean-fixture.ts`; remove `search:smoke` from package scripts. No Search package/environment/daemon/readiness or bespoke CI job exists to remove.
3. Retain `src/integrations/search/schema.ts`, its schema import, Projects `searchVector` generated declaration and `project_search_vector_idx`, `drizzle/0004_search.sql`, snapshots/journal and all project records. The schema-only helper has no runtime Search dependency. Keeping declarations prevents accidental drops from later db:generate. A generated clean consumer retains its own domain schema/history; Search ships no production migration.
4. Remove `search` from `referenceApplication.enabledCapabilities` when present, keeping defaultInstalled false. Update docs and run governance/types/tests/build/E2E and the production migration/container path. Build/start needs no Search operation.
5. If also pruning authoring, remove `capabilities/search/`, `docs/evaluations/SEARCH_MODULE_EVALUATION.md` and `.agents/skills/search-change/`, retain stable catalog ID as deferred, remove implementation metadata and update ROADMAP/docs. Other capability statuses stay unchanged.

Removing Search code never deletes application records. Dropping the generated column/index later requires a new explicit reviewed migration; preserve applied migration history. There is no CLI uninstall transaction. The clean lifecycle fixture builds before removal and after removal, proving retained domain records, generated vector, schema helper and migration hashes.

## Remove Import / Export

Remove `import-export` from `referenceApplication.enabledCapabilities`, keeping `defaultInstalled: false`. Stop transfer producers and drain or preserve pending Jobs first. Remove `/app/transfers`, `/api/transfers-stage`, `src/features/import-export`, the navigation link, `src/lib/import-export.server.ts`, the `referenceTransferJobs` registry import/spread, transfer operator/fixture/unit scripts and `import-export:*` scripts; remove csv-parse/csv-stringify when unused. Keep `src/integrations/import-export/schema.ts` and validation types, schema export, applied migration SQL/journal, transfer tables/history, Jobs/Storage packages and objects. Remove other runtime transfer modules after unregistering the handler. Remove server configuration pass-through. Explicit selected artifact purge is a separate operator decision, default dry-run. Never drop customer data or delete object prefixes on removal.

Independent add-on assets overlay only the clean Jobs registry and Drizzle configuration; customized consumers must preserve their existing schema/handlers manually. Keep authoring workspaces separately from runtime removal. Run frozen/updated install as appropriate, capabilities/agent checks, typecheck/build and remaining capability lifecycles.

Opt-in Ops / Admin provides guarded read-only `/admin/ops` and `/api/ops/summary`, privileged server-only `OPS_ADMIN_USER_IDS`, explicit application-owned optional adapters, no persistence. See [capability contract](../capabilities/ops-admin/CAPABILITY.md) for installation/removal and deadline limitations.

## Remove Invoice Ninja

Remove `invoice-ninja` from `referenceApplication.enabledCapabilities`, keeping `defaultInstalled: false`.

Stop/drain its workers and settle or explicitly recover outstanding attempts. Remove `/app/invoices`, Invoice Ninja API routes/navigation, `src/lib/invoice-ninja.server.ts` and its Jobs registry import/spread. Remove provider runtime files and optional environment settings, but retain application-owned schema/validation/error types, all tables/data, applied SQL/journal/history and Jobs/Webhooks. Keep schema declarations in Drizzle until deliberately migrating data ownership. Never delete provider invoices or deregister callbacks as a side effect. See the capability contract for exact limitations.

## Removing Stripe independently

Remove `stripe` from `referenceApplication.enabledCapabilities`, keeping `defaultInstalled: false`.

Stop Stripe producers and worker processing first; settle/expire active attempts using explicit bounded recovery. Remove `/api/integrations/stripe` routes, `/app/payments` page/navigation, `src/lib/stripe.server.ts`, and `referenceStripeJobs` import/spread from the existing Jobs registry. Remove Stripe operational scripts and runtime files except `schema.ts`/`contract.ts`, then remove the `stripe` runtime dependency. Retain provider schema exports and all committed migration SQL/metadata, bindings, projections, operation ledgers and receipt history. Keep Jobs and Webhooks. Rebuild routes, run capability/root checks, typecheck/build and Jobs doctor/smoke. Remove authoring workspace separately only if desired. This never deregisters remote callbacks, revokes credentials or deletes provider resources; those need separate operator authorization. See [Stripe contract](../capabilities/stripe/CAPABILITY.md).

## Medusa removal

Remove `medusa` from `referenceApplication.enabledCapabilities`, keeping `defaultInstalled: false`.

Stop Medusa producers and the existing worker, settle or expire active45s attempts, then remove `src/routes/app.medusa.tsx`, `src/routes/api/integrations/medusa`, `src/lib/medusa-http.server.ts`, `src/lib/medusa.server.ts`, the Commerce navigation link and Medusa registry import/spread. Retain the Medusa schema, projection/contract declarations, four tables and migration history; remove the remaining Medusa runtime files and scripts. Keep Jobs and Webhooks. Rebuild the route tree, typecheck/build and verify retained rows before restarting remaining handlers. Remote resources and credentials are unaffected; their deletion/revocation requires a separately authorized operator action. The clean fixture proves this lifecycle on its own disposable database.

Keep all additive provider SQL and cumulative snapshots described in the [integrated migration history](CAPABILITIES.md#integrated-provider-migration-history). Application removal and deleting reusable authoring workspaces are separate choices; neither authorizes data deletion or rewriting applied history.

### Remove Data Table

Remove application imports, the component and its browser fixture scripts/package script, then remove the table dependency. Keep Playwright if other tests use it. Follow the exact [Data Table removal contract](../capabilities/data-table/CAPABILITY.md), then typecheck and build. No migrations or stored data are affected.

## Rich Text removal

Remove the Rich Text imports, `src/integrations/rich-text`, `/rich-text-test` reference route and `e2e/rich-text.e2e.ts`, fixture scripts and package scripts. Remove the three `@tiptap` packages and client Vite optimizeDeps entries, then reinstall, regenerate routes, typecheck and rebuild. Preserve user documents. Keep reusable authoring assets if desired. Details and generated-consumer removal are in [the contract](../capabilities/rich-text/CAPABILITY.md).

## Remove File UI

Remove `src/components/file-ui.tsx`, `src/integrations/file-ui`, `src/routes/app.files.tsx`, `src/routes/api/files`, `src/lib/file-ui.server.ts`, `src/lib/file-ui-metadata.server.ts`, the Files navigation link and file-ui scripts/tooling. Keep `src/db/file-ui-schema.ts` and its schema export, SQL0016_file_ui, cumulative migration history and durable receipts. Never delete Object Storage files, configuration, credentials, buckets or objects as UI removal. Regenerate routes, run capability checks, typecheck and rebuild. Generated consumer removal is separately proved by `scripts/file-ui-remove.ts` while preserving a stored marker; no automatic uninstall transaction exists.
### Remove Markdown / Code Content

Remove application routes/loaders/component and CSS imports first (the reference owns `/markdown-test` and `src/features/markdown-reference.ts`). Remove `src/integrations/markdown-code`, module fixture scripts and `markdown-code:*` scripts; uninstall `markdown-it` and `shiki` if unused elsewhere. Keep Playwright and Bun types when other tests need them. Regenerate routes, typecheck and rebuild. No migrations or persisted data are involved. Retaining authored add-on source is a separate choice; remove reference enablement when present but keep catalog identity. See the [exact contract](../capabilities/markdown-code/CAPABILITY.md).

### Removing Flow / Canvas

Remove application `FlowCanvas`/graph helper/CSS imports and the root-only `/flow-test` route (or your own graph routes), then `src/integrations/flow-canvas` and `scripts/flow-canvas-*`. Remove `flow-canvas:*` package scripts and @xyflow/react only if no other feature uses it. Remove the scoped client `optimizeDeps.include` entry when unused. Root-specific e2e/DOM checks and their CI commands must follow the runtime removal. Regenerate routes, reinstall, typecheck and rebuild. Stored graph documents belong to your application and are retained. Keeping `capabilities/flow-canvas` authoring source is a separate choice from installing its runtime.

Internationalization removal: first remove `src/routes/i18n-test.tsx` and `src/features/i18n-reference.ts`, then runtime `src/integrations/internationalization`, root `scripts/internationalization-*`, its package scripts and unused i18next/react-i18next dependencies. Retain shared Playwright and reusable capability source unless separately pruning it. Remove reference enablement, regenerate routes, reinstall, typecheck and rebuild; no data or migration is deleted. See [full contract](../capabilities/internationalization/CAPABILITY.md).

## PWA / Offline removal

First deploy `retired: true` at the SAME historical worker URL/scope and retain its tombstone for returning clients. Allow old tabs to close naturally; verify only owned caches disappear. Then remove runtime imports/build integration/dependencies, keeping that exact public retirement script through subsequent builds. Deleting source or unregistering one browser does not retire production clients. See the full [two-phase contract](../capabilities/pwa-offline/CAPABILITY.md).

## Identity policy capabilities

The root reference deliberately enables all three in-progress identity capabilities; independent consumers remain opt-in. Their authored and retained source is available for preparation, but integrated-tree acceptance remains pending and fault-injection fixtures are paused. Select `capabilities/organizations/add-on.json`, `capabilities/authorization/add-on.json` or `capabilities/feature-flags/add-on.json` through the generic CLI. Review shared auth/schema/config overlays before combining them; use existing journals and generate additive migrations in a deployed application. Never replace an applied journal with a fresh scaffold journal. The root's notes example remains separate from personal Projects.

### Remove Organizations

Remove the organization plugin/global hooks/client plugin, dedicated auth pool, settings/env entries, organization route/navigation and notes application. Restore baseline auth's existing API-key/magic-link/OIDC dispatch hooks and adapter while preserving their behavior. Remove the optional tenant resolver/mapped-role adapters from application policy and the tenant selection in Flags projection; unresolved tenant scopes must deny. Personal Projects remain owner-filtered. Retain organization/member/invitation/note tables and native session column data, schema-only declarations and `0017_organizations_v1.sql` and its additive migration history. Keeping schema-only declarations in the migration configuration prevents accidental future drops; plugin registration/client projections can be removed without changing stored columns. Stop any organization-scoped jobs or give them an authoritative replacement resolver; stale active selection is never access. Do not delete owners/data or auto-reassign orphan organizations. Operator diagnostic/recovery is documented in the [contract](../capabilities/organizations/CAPABILITY.md).

### Remove Authorization

Restore explicit personal owner checks and current-member/read + owner/admin/write notes checks before removing `application-policy.server.ts` and policy calls. Remove machine-key policy adapter while keeping baseline credential verification/grants/rate limits. No protected route may lose its original predicate/guard. Delete evaluator/validation integration code and its CLI grant/revoke path; retain schema-only assignment declarations, tables and `0018_authorization_v1.sql` and its additive migration history. Organizations native administrative permissions remain valid. Flags retain their own trusted management guard and existing security boundaries.

### Remove Feature Flags

Remove `/api/flags`, product hook/panel, operator flag commands and provider/evaluator code; the panel defaults to absent. Preserve ordinary Authentication/Authorization and resource predicates. Retain schema-only definition/override declarations, tables and `0019_feature_flags_v1.sql` and its additive migration history. No target/membership cleanup, remote service or environment setting is implied. Disable is a reversible management action; data deletion is a separate operator-approved additive destructive migration.

For every removal run governance/typecheck/build, relevant backend and development/production browser coverage, both explicit migrations, worker and production health. Generic fixtures must prove independent runtime removal/rebuild with retained data and exact migration history; those results are pending on this integrated tree. Fault-injection execution requires separate review and authorization. Removing reusable authoring is separate: prune the exact capability/evaluation, remove implementation metadata, retain stable catalog ID as deferred and update roadmap/docs. Do not remove unrelated capabilities.
