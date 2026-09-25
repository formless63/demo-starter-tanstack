# Commands

- `bun install --frozen-lockfile`: reproduce dependencies.
- `docker compose up -d postgres`: start PostgreSQL 18; required for migrations and a live app.
- `bun run dev`: Vite/TanStack Start development server on 3000.
- `bun run db:generate`: generate SQL after schema changes; inspect the result.
- `bun run db:migrate`: apply committed migrations; never use push for production.
- `bun run auth:provision`: idempotently provision Pocket ID from local credentials.
- `bun run lint`, `bun run typecheck`, `bun test`: static and unit verification.
- `bun run test:e2e`: Playwright landing/protection smoke test (browser install required).
- `bun run build`, `bun run start`: create and run the Node-compatible production output.
- `bun run check`: lint, types, unit tests, and production build. CI additionally migrates clean PostgreSQL and runs Playwright.
