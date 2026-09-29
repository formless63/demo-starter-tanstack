# Jobs capability

Status: done and optional (`defaultInstalled: false`). The root reference application enables Jobs so its integrated path remains continuously tested; a clean generated consumer does not receive it unless selected. Evaluation: `JOBS_MODULE_EVALUATION.md`.

## Requirements

**Requires:** No other capability module. The implementation requires the base starter's PostgreSQL database and configured Drizzle integration. The current TanStack CLI identifies the official Drizzle add-on as `drizzle`; `capabilities/jobs/.add-on/info.json` therefore declares `dependsOn: ["drizzle"]`. Installing only the `drizzle-orm` npm package is not sufficient because Jobs imports the configured `#/db` transaction boundary.

**Integrates with:** Observability and Ops / Admin. These are optional and their absence does not prevent enqueueing, migration, or worker operation.

**External:** PostgreSQL is required for durable queue storage and coordination.

**Conflicts:** None. TanStack CLI 0.71 supports `dependsOn` but not arbitrary conflict metadata, so the catalog and this contract explicitly record the empty conflict set without inventing an unsupported add-on field.

The catalog records the independently installable TanStack add-on ID as `postgres-jobs`. Add-on dependency and conflict arrays use TanStack add-on IDs; capability-level `requires` continues to use stable capability IDs.

## Adds

### Dependencies

- `pg-boss` 12.35.0 is the queue implementation.
- `drizzle-orm` supplies the existing transaction API and SQL tag used by pg-boss's official Drizzle adapter.
- `zod` validates payloads at enqueue and worker boundaries.

The add-on package metadata declares all three packages and the framework-native `drizzle` add-on dependency.

### Add-on packaging

- `capabilities/jobs/.add-on` is the official TanStack custom add-on source and owns metadata, package/script additions, environment declarations, and installed assets.
- `capabilities/jobs/.cta.json` supplies the capability-local authoring context required by the official compiler.
- `capabilities/jobs/add-on.json` is the retained distributable produced by `bun run add-ons:compile jobs`.
- `capabilities/jobs/test/clean-install.json` owns the disposable scaffold expectations used by `bun run add-ons:test jobs`.

The Jobs directory is independent of future `capabilities/<id>` add-ons. Its distributable can be installed alone and does not pull unrelated capabilities. Reference-application enablement is separate from the catalog's `defaultInstalled` field.

### Environment

- `DATABASE_URL`: baseline fallback PostgreSQL connection.
- `PGBOSS_DATABASE_URL`: optional jobs-specific PostgreSQL connection; otherwise `DATABASE_URL` is used.
- `PGBOSS_SCHEMA`: optional schema name, default `pgboss`.
- `PGBOSS_USE_LISTEN_NOTIFY`: optional `true` opt-in; defaults to polling with value `false`.
- `JOBS_CONCURRENCY`: optional per-queue local concurrency, default `4`, allowed range 1–100.

### Scripts

- `bun run jobs:migrate`: explicitly install or upgrade the pg-boss schema.
- `bun run jobs:doctor`: report version and schema drift, exiting nonzero for unhealthy drift.
- `bun run jobs:worker`: run the standalone worker with graceful SIGINT/SIGTERM handling.
- `bun run jobs:smoke`: run a real worker, enqueue `starter.echo`, and verify stored completion output.

### Database/migrations

Normal application and worker instances set `migrate: false`. `jobs:migrate` is the only supported schema mutation path. pg-boss currently installs schema version 43 in the configurable dedicated schema. Queue registration is idempotent runtime data setup and is separate from schema migration.

The transaction enqueue API uses `fromDrizzle(tx, sql)`, so an application database write and job insert commit or roll back in the same PostgreSQL transaction.

### Runtime processes

- The application may enqueue through the lazy jobs client.
- `jobs:worker` is a separately deployable long-lived process.
- `jobs:migrate` and `jobs:doctor` are one-shot operator processes.
- `jobs:smoke` is a finite verification process that owns its temporary worker.

### Compose/infrastructure

`compose.yaml` adds `jobs-migrate` and `worker`. They use the same `${APP_IMAGE}` revision as `migrate` and `app`, connect to the `postgres` service rather than localhost, contain no development bind mounts, and run under the image's non-root `node` user. The worker starts only after healthy PostgreSQL and has `restart: unless-stopped`. A failed jobs migration blocks the documented release flow; long-lived startup never migrates automatically.

## Application API

`src/integrations/jobs/registry.ts` is the source of truth for names, Zod payloads, retry/expiry settings, and handlers.

- `sendJob(name, payload)` validates and persists a typed job.
- `sendJobInTransaction(tx, name, payload)` atomically couples enqueueing to an existing Drizzle transaction.
- `getJobsClient()` exposes the initialized client for operational cases and tests.
- `startJobsWorker()` starts registered consumers with boundary validation and structured lifecycle logs.

`starter.echo` is a deliberately small end-to-end example, not an application feature.

## Installation

For TanStack CLI installation, use `capabilities/jobs/add-on.json` through the CLI's normal custom add-on URL mechanism. The add-on declares `dependsOn: ["drizzle"]`, so the actual Drizzle integration is installed/configured rather than silently assuming an npm package is enough. The target must select PostgreSQL for Drizzle.

After package installation:

1. Configure `DATABASE_URL` or `PGBOSS_DATABASE_URL`.
2. Run `bun run jobs:migrate`.
3. Run `bun run jobs:doctor` and `bun run jobs:smoke`.
4. Add the bundled scripts and `jobs-migrate`/`worker` services to the production artifact path when applying outside this starter.
5. Start the worker only after both application and jobs migrations succeed.

## Removal

The verified application-removal recipe is maintained in `docs/STARTING-A-PROJECT.md`. In summary:

1. Stop every worker and prevent new producers from enqueueing.
2. Decide how retained jobs must be drained or archived.
3. Remove Jobs API usage, registry tasks, operational scripts, tests, Docker bundles, and the `jobs-migrate`/`worker` Compose services.
4. Remove `pg-boss` only when no other code uses it; retain baseline Drizzle and Zod dependencies.
5. Remove `jobs` from `referenceApplication.enabledCapabilities`. Keep the catalog entry and add-on authoring workspace when the repository should still distribute Jobs; pruning that reusable source is a separate governance action.
6. Keep the `pgboss` schema and applied database history by default. Drop the dedicated schema only through an explicit destructive operation after backup and retention review.

The TanStack CLI does not provide a general automatic uninstall transaction for this custom add-on, so removal is reviewed and verified rather than inferred.

## Upgrade considerations

- Review pg-boss release notes and Node/PostgreSQL support before changing the pinned version.
- Build one image revision and run its `jobs:migrate` before starting that revision's application or worker.
- Run `jobs:doctor` after migration and treat drift or version failure as a blocked release.
- Preserve `migrate: false` for every long-lived runtime instance.
- Re-test Drizzle transaction adapter compatibility and both commit/rollback behavior.
- Recompile `capabilities/jobs/add-on.json` whenever its `.add-on` source metadata or assets change, and commit both sides of the change.

## Verification

Run:

```bash
bun run capabilities:check
bun run capabilities:status
bun run add-ons:test jobs
bun run jobs:migrate
bun run jobs:doctor
bun test src/integrations/jobs
bun run jobs:smoke
```

The clean-install test invokes the official TanStack CLI against a disposable blank Start scaffold, proves that `dependsOn` resolves the official PostgreSQL Drizzle integration, verifies installed files/packages/scripts, and builds the generated application. The integration suite covers atomic commit, atomic rollback, and invalid payload failure. CI also runs migrations, doctor, and smoke from the production image, starts the long-lived worker, verifies application health, and tears the stack down.

## Agent guidance

Read `ROADMAP.md`, this document, `.agents/skills/capability-change/SKILL.md`, and `.agents/skills/jobs-change/SKILL.md` before changing Jobs. Keep registry payloads validated, preserve explicit migration ownership, keep optional integrations optional, and update the roadmap, catalog, this contract, capability-local add-on source/fixture/distributable, and evaluation together when their facts change.
