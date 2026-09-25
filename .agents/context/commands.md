# Commands

- `bun install --frozen-lockfile`: reproduce dependencies.
- `docker compose up -d postgres`: start only PostgreSQL 18 for local development; application services are not started.
- `bun run dev`: Vite/TanStack Start development server on 3000.
- `bun run db:generate`: generate SQL after schema changes; inspect the result.
- `bun run db:migrate`: apply committed migrations from the host for local development; never use push for production.
- `bun run auth:provision`: idempotently provision Pocket ID from local credentials.
- `bun run lint`, `bun run typecheck`, `bun test`: static and unit/integration verification.
- `bun run test:e2e`: Playwright landing/protection smoke test (browser install required).
- `bun run build`, `bun run start`: create and run the Node-compatible production output.
- `bun run check`: lint, types, tests, and production build.
- `docker compose build` (or the focused `docker compose build app`): build the shared production image used by both `migrate` and `app`.
- `docker compose up -d --wait postgres`: start PostgreSQL and require its healthcheck to pass.
- `docker compose run --rm migrate`: explicitly apply committed migrations with the production image; a nonzero exit blocks the release.
- `docker compose up -d --wait app`: start or update the production application after migrations succeed.
- `docker compose logs -f app`: follow application logs.
- `docker compose down`: stop and remove the stack while retaining database data; add `--volumes` only when data removal is intended.

CI uses the containerized migration path, runs all repository checks and Playwright, starts the production image, waits for its healthcheck, curls `/api/health`, and always tears the stack down.
