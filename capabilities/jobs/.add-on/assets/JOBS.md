# PostgreSQL jobs add-on

This add-on installs the reusable pg-boss module and operator scripts. Its TanStack CLI metadata depends on the official `drizzle` add-on, which must be configured for PostgreSQL and provide the `#/db` export and `DATABASE_URL` used by Jobs.

Apply `bun run jobs:migrate` explicitly before starting either the application or `bun run jobs:worker`. Runtime instances deliberately set `migrate: false`. Use `bun run jobs:doctor` after migration and `bun run jobs:smoke` to enqueue and consume the demo `starter.echo` job.

For production, bundle the four `scripts/jobs-*.ts` entrypoints into the same application image. Run `jobs-migrate` as a one-shot release job and `jobs-worker` as a separately restartable process using that same image revision.
