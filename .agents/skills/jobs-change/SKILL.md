# Jobs change

Use this workflow when adding or changing a background job.

1. Read `src/integrations/jobs/registry.ts`, the affected task, and the jobs commands in repository context.
2. Add the queue name, Zod payload schema, queue policy, and handler through the typed registry. Never accept an unvalidated worker payload.
3. Enqueue through `sendJob`; when an application write and enqueue must be atomic, use `sendJobInTransaction` inside the same Drizzle transaction.
4. Keep application and worker startup on `migrate: false`. Schema changes belong in the explicit `jobs:migrate` release step.
5. Test validation, successful consumption, failed payload behavior, and transaction commit/rollback as applicable.
6. Run `jobs:doctor`, the relevant tests, `jobs:smoke`, and the production container path before release.
