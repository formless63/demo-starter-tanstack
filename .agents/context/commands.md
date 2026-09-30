# Commands

- `bun install --frozen-lockfile`: reproduce dependencies.
- `docker compose up -d postgres`: start only PostgreSQL 18 for local development; application services are not started.
- `bun run dev`: Vite/TanStack Start development server on 3000.
- `bun run db:generate`: generate SQL after schema changes; inspect the result.
- `bun run db:migrate`: apply committed migrations from the host for local development; never use push for production.
- `bun run jobs:migrate`: explicitly install or upgrade the pg-boss schema.
- `bun run jobs:doctor`: fail on missing, outdated, or drifted pg-boss schema state.
- `bun run jobs:worker`: run the standalone worker with graceful signal handling.
- `bun run jobs:smoke`: enqueue and consume the demo echo job through a real worker.
- `bun run auth:provision`: idempotently provision Pocket ID from local credentials.
- `bun run capabilities:check`: validate capability schema, relationships, documentation, scripts, and add-on metadata.
- `bun run capabilities:status`: read-only summary of completed add-on availability, reference-app enablement, generated-consumer defaults, relationships, and external requirements.
- `bun run add-ons:compile [id ...]`: compile declared custom add-ons with the pinned official TanStack CLI; outputs stay at `capabilities/<id>/add-on.json`.
- `bun run add-ons:test [id ...]`: reject stale compiled output, install each selected add-on into a clean disposable Start scaffold, verify official dependencies/assets/package additions, and build it.
- `bun run add-ons:matrix`: print the completed custom add-on IDs used by CI's data-driven matrix.
- `bun run api-platform:smoke`: verify hashed machine credentials, read/write permission enforcement, protected Projects operations, and OpenAPI validation against a migrated PostgreSQL database.
- `bun run observability:smoke`: isolated safe logs/context/span/metric proof plus real trace/metric OTLP export to a temporary local receiver; requires no database or external backend.
- `bun run storage:unit`: backendless configuration/key/signature/metadata/multipart/error checks.
- `bun run storage:check`: non-mutating configuration/credential/HEAD bucket access check.
- `bun run storage:smoke`: real private operations/presign/multipart with unique own-prefix cleanup; configured bucket required.
- `bun run storage:compat`: same complete suite on disposable pinned RustFS/Garage stacks, cleaned in finally; Docker required, no AWS credentials. Set `STORAGE_SMOKE_SCRIPT=scripts/storage-reference-smoke.ts` for optional root telemetry wiring and `STORAGE_SMOKE_IMAGE=tanstack-launchpad:local` to exercise the production Node bundle too.
- `bun run storage:compat --garage-ui`: additionally verify optional Noooste Garage UI v0.13.0 health, token authentication/rejection, Garage 2.4.1 Admin API and S3 reads. CI and Storage's clean fixture run this option; core S3 operation does not require the UI.
- `bun run storage:dev:rustfs` / `storage:dev:garage`: start one optional local provider and explicitly initialize development bucket/CORS. Configure application env separately per CAPABILITY.md.
- `bun run storage:dev:down`: stop the optional stack retaining named volumes; no remote data removal.
- `docker compose -f compose.storage.yaml --profile garage --profile garage-ui up -d garage garage-ui`: optional loopback-only third-party admin UI, token login; not a runtime requirement.
- `bun run email:check`: lazy SMTP config + connection/TLS/auth verify; sends no message.
- `EMAIL_SMOKE_TO=person@example.test bun run email:smoke`: one explicit SMTP test message, no content output.
- `bun run email:unit`: deterministic Email config/message/security/error/rendering tests.
- `bun run email:compat`: disposable Mailpit real SMTP/MIME/partial/bounds/451/550 Chaos; `--reference` adds actual Better Auth SMTP/token/session, `--production` adds the built Node image on the migrated Compose database network.
- `bun run email:dev:mailpit` / `email:dev:down`: explicitly start/stop temporary loopback capture; no relay or persistent volume.
- `bun run lint`, `bun run typecheck`, `bun test`: static and unit/integration verification.
- `bun run test:e2e`: Playwright landing/protection smoke test (browser install required).
- `bun run build`, `bun run start`: create and run the Node-compatible production output.
- `bun run agents:check`: fast, read-only validation of canonical agent guidance, skills and project hook adapters.
- `bun run agents:test`: synthetic hook payload and disposable Git fixture tests; no agent CLI or credentials.
- `bun run check`: agent harness, capability governance, lint, types, tests, and production build.
- Agent completion hooks run only staged/unstaged whitespace checks and the relevant capability/harness checks (`capabilities:check` and/or `agents:check`) when governed paths change; full task checks and CI remain required.
- `docker compose build` (or the focused `docker compose build app`): build the shared production image used by migrations, `app`, and `worker`.
- `docker compose up -d --wait postgres`: start PostgreSQL and require its healthcheck to pass.
- `docker compose run --rm migrate`: explicitly apply committed migrations with the production image; a nonzero exit blocks the release.
- `docker compose run --rm jobs-migrate`: explicitly apply pg-boss migrations with the same image revision.
- `docker compose run --rm worker node .output/jobs-doctor.mjs`: diagnose the containerized jobs schema.
- `docker compose run --rm worker node .output/jobs-smoke.mjs`: exercise containerized enqueue and consumption.
- `docker compose up -d worker`: start the separately restartable production worker after both migrations succeed.
- `docker compose up -d --wait app`: start or update the production application after migrations succeed.
- `docker compose logs -f app`: follow application logs.
- `docker compose down`: stop and remove the stack while retaining database data; add `--volumes` only when data removal is intended.

CI gives each completed add-on matrix job PostgreSQL so capability fixtures may declare clean migration/smoke commands. The main job uses the containerized migration path, runs all repository checks and Playwright, starts the production image, waits for its healthcheck, probes `/api/health`, `/api/openapi.json`, and `/docs/api`, and always tears the stack down.

For a downstream lean application, follow `docs/STARTING-A-PROJECT.md`. Its Jobs-only, API-only, and combined removal recipes preserve database data/migration history by default and finish with capability governance, typecheck, and build verification.

`bun run webhooks:unit` proves protocol/security; `bun run webhooks:smoke` owns disposable real HTTP receiver/sender and exercises existing Jobs retries on a migrated disposable database. `bun run add-ons:test webhooks` verifies transitive custom Jobs installation and removal retaining Jobs.
