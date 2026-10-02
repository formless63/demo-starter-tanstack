# PostgreSQL jobs add-on

This add-on installs the reusable pg-boss module and operator scripts. Its TanStack CLI metadata depends on the official `drizzle` add-on, which must be configured for PostgreSQL and provide the `#/db` export and `DATABASE_URL` used by Jobs.

Apply `bun run jobs:migrate` explicitly before starting either the application or `bun run jobs:worker`. Runtime instances deliberately set `migrate: false`. Use `bun run jobs:doctor` after migration and `bun run jobs:smoke` to enqueue and consume the demo `starter.echo` job.

For production, bundle the four `scripts/jobs-*.ts` entrypoints into the same application image. Run `jobs-migrate` as a one-shot release job and `jobs-worker` as a separately restartable process using that same image revision.

Producer/admin instances disable scheduling and supervision; standalone workers enable both. Only the explicit migration role enables migration. Handlers can optionally accept native `{ id, signal, retryCount, retryLimit? }` context; workers request metadata so the retry limit comes from each persisted job. A cancellation signal alone does not mean the attempt is terminal. Concurrency defaults to 4 and accepts integers 1–100. Doctor must pass as a separate structural-drift release gate.

Transactional enqueue requires one explicit canonical host/database, case-insensitive hostname and default port 5432. Credentials and ordinary sslmode/application_name options may differ; routing query overrides host/hostaddr/port/dbname/service are rejected in either URL. Database decoding follows the installed driver and DNS aliases must be normalized by the application. No cross-database atomicity is supplied.
