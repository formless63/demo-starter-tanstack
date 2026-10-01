# Capability wave integration verification

Verified September 30, 2026 on `integration/capability-wave`, based on main `779b28204b1eb3785b9d04bcdba06628a5ee477c`. This is reconciliation only; no additional planned capability was implemented. Original source branches were neither rewritten nor pushed.

## Integrated commits and conflicts

| Capability | Exact source commit | Cherry-picked commit |
| --- | --- | --- |
| Webhooks | `1d452ac67f86bfad1b869997ed64496841eaece6` | `1b133b027c06c7a8f1d1b02c0f8e6ac9b9856cfc` |
| Audit Log | `c11c4b1f29d1954baf75dd3fa16e4dd2ff6dc6e6` | `ad5b5091d5ecb3d3fd40a2a78f548c6a92395e8e` |
| Cache / Coordination | `ad52021e2586a886306f206e0d557c1eacbb57f0` | `3d9ee12857c295720f1ef98361401ea22ec83cbd` |

The commits were inspected and cherry-picked individually in that order. Shared conflicts were merged as a union: README, ROADMAP, catalog, capability/starting-project docs, package scripts and agent context. Cache additionally conflicted in `.env.example`. Webhooks and Audit conflicted in the agent-hook fixture; main's generalized evaluation-document discovery was retained byte-for-byte. The lockfile merged additively, adding only Redis 6.3.0 and its packages while preserving Email and unrelated resolved versions. Frozen install passes without further lock changes.

## Final contracts

All eight completed capabilities are reference-enabled with `defaultInstalled: false`: **jobs, api-platform, observability, object-storage, email, webhooks, audit-log, cache-coordination**. Webhooks requires Jobs and declares the actual custom add-on ID `postgres-jobs`; Audit, Cache and Email have no hard capability dependency. Cache's application-owned Observability wrapper is recorded as an optional edge. Catalog governance verifies the sparse acyclic hard dependency graph.

Webhooks already supplied the shared 64 KiB default event/queued-body limit, 1 MiB configurable direct ceiling, 10-second deadlines, 300-second tolerance bounded at 900, and five retries after the initial attempt with 30-second exponential/jittered delay capped at 900 seconds. Reconciliation raises both configurable timeout minima from 10 ms to **100 ms**, preserving the 30-second ceiling. Runtime, assets, contract, compiled output and fixtures are synchronized. Raw-byte HMAC, rotating secrets, stable event/body, fresh attempt signatures/timestamps, application-owned targets/replay storage, manual redirects, retry classification and permanent terminal outcomes remain intact.

Audit already meets the shared contract: `projects.create`, `projects.update`, `projects.delete`; namespaced validation; `(action, created_at DESC, id DESC)` index; 8 KiB encoded metadata, depth 6, 50 keys/object, 100 array entries and 1,024 nodes, plus existing stricter safety checks. Coupled Project/audit transactions, safe machine key-record IDs, timestamptz(3), application UUIDs, keysets and retained schema/history remain intact. No tenant columns were added.

Cache preserves lazy server-only node-redis/Valkey primitives, TLS verification, 300-second TTL/1 MiB defaults, namespaces, atomic increment/expiry, ownership-checked advisory leases, ephemeral pub/sub and separate nonpersistent infrastructure. A new fixture seeds a non-expiring key on disposable Valkey, runs the existing application-removal script, verifies the backend/data survive, and cleans up only its own container.

The wave regression requires these eight modules and retained Email/auth delivery while deriving the complete reference/matrix sets from the catalog, allowing future capabilities without fixture list changes. Existing clean fixtures prove transitive Jobs installation, Webhooks removal retaining functional Jobs, and Audit removal retaining schema/migrations/rows. AGENTS.md, agent hooks, evaluation discovery, Email/auth runtime and Storage source/assets remain unchanged from main. Docs/context now describe eight completed capabilities and consistent removal boundaries; historical evaluations were preserved.

## Exact verification commands and results

All commands below passed on local/disposable infrastructure. Tooling: Bun 1.4.2 and production Node 24.21.0; the final full repository check also used local Node 24.21.0.

| Command | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Passed; final install reports no changes |
| `bun run agents:check` | Passed |
| `bun run agents:test` | 120 passed, including catalog-driven evaluation discovery |
| `bun run capabilities:status` | Eight available/reference-enabled capabilities, all optional by default |
| `bun run capabilities:check` | Passed schema, graph, scripts, files and add-on metadata |
| `bun run add-ons:compile` | All distributables compiled; changed Webhooks/Cache outputs rebuilt afterward |
| `bun run add-ons:matrix` | Exactly the eight completed IDs above |
| `bun test src/integrations/capability-wave.test.ts` | 2 passed; rerun after final discovery adjustment |
| `bun run db:migrate` | Passed, including Audit migration |
| `bun run jobs:migrate` | Passed |
| `bun run webhooks:unit` | Published vector, raw verification, rotation, timeout/tolerance/input bounds and replay extension passed |
| `bun run webhooks:smoke` | Real signed HTTP/inbound handoff, pg-boss retry/exhaustion, permanent result, stable body/ID and safe logs passed |
| `bun test src/integrations/audit-log src/features/projects/audit.integration.test.ts` | 25 passed: clean real PostgreSQL migrations/indexes, commit/rollback, keysets and user/machine Project integration |
| `bun run audit-log:smoke` | Passed |
| `bun run cache:unit` | Passed |
| `bun run cache:telemetry` | Safe optional signals passed |
| `bun build scripts/cache-smoke.ts --target=node --outfile=/workspace/cache-smoke.mjs` | Passed |
| `CACHE_COMPAT_NODE_SCRIPT=/workspace/cache-smoke.mjs bun run cache:compat` | Actual Valkey contract passed on Bun and Node 24: concurrency, TTLs, leases, pub/sub, restart/recovery and shutdown |
| `bun run check` | Governance, lint, types, 188 tests (0 failures) and production build passed |
| `bun run typecheck` / `bun run lint` | Passed again after final fixture/metadata/regression edits |
| `CI=true bun run test:e2e` | 3 passed after `bun x playwright install chromium` |
| `bun run email:compat --reference --production` | Mailpit SMTP/MIME/Bcc/partial/Chaos, Better Auth hashed token/delivery/session, production Node image and safe logs passed |
| `STORAGE_SMOKE_IMAGE=tanstack-launchpad:local STORAGE_SMOKE_SCRIPT=scripts/storage-reference-smoke.ts bun run storage:compat --garage-ui` | RustFS/Garage, telemetry, production Node bundle and Garage UI health/auth/Admin API/S3 reads passed |

Targeted `bun run add-ons:test webhooks`, `bun run add-ons:test audit-log`, and `bun run add-ons:test cache-coordination` passed first. Then every completed lifecycle was rerun successfully:

```sh
bun run add-ons:test jobs
bun run add-ons:test api-platform
bun run add-ons:test observability
bun run add-ons:test object-storage
bun run add-ons:test email
bun run add-ons:test webhooks
bun run add-ons:test audit-log
bun run add-ons:test cache-coordination
```

Cache passed again after adding the retained-data regression. Its final documentation-only artifact change was recompiled and passed catalog/frozen-install checks. Each fixture rejects stale output, installs through the pinned official CLI, and exercises its declared lifecycle with real disposable services where needed.

## Production image and environment accommodations

Initial `docker compose build app` failed during package downloads with the managed proxy's `SELF_SIGNED_CERT_IN_CHAIN`. A temporary Dockerfile outside the repository changed only installation to mount the session CA as a BuildKit secret and set `NODE_EXTRA_CA_CERTS`; TLS verification remained enabled, and the CA did not enter an image layer:

```sh
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" \
  -f /workspace/Dockerfile.integration -t tanstack-launchpad:local .
docker compose run --rm migrate
docker compose run --rm jobs-migrate
docker compose run --rm worker node .output/jobs-doctor.mjs
docker compose run --rm worker node .output/jobs-smoke.mjs
docker compose run --rm worker node .output/webhooks-smoke.mjs
docker compose up -d worker
docker compose up -d --wait app
```

All passed. Worker was running and app healthy. `/api/health` reported `status=ok`, `environment=production`, `runtime=node 24.21.0`, and `checks.database=ok`. OpenAPI was 3.1.1; API docs returned success; request correlation echoed `container-smoke`. Explicit container checks confirmed no webhook URL/secret, no Cache URL, no SMTP host and `MAGIC_LINK_ENABLED=false` in default configuration. Enabled magic links were separately proved with disposable Mailpit using the same image. Long-lived test app/worker were stopped afterward.

Initial Storage fixtures failed Garage UI's S3 read because the injected proxy intercepted the container-local `garage` hostname. A temporary invocation wrapper/Compose overlay outside the repository supplied local `NO_PROXY/no_proxy`; the unmodified Storage lifecycle, root telemetry and production bundle then passed. Docker credentials/config and Storage contracts were unchanged. Workspace-local tooling supplied pinned Bun/Node.

The generic CI matrix and reference integration steps are preserved. Equivalent local verification passed; hosted GitHub Actions was not launched and the branch was not pushed.

## Publication limitations

External publication remains deferred. Pinned TanStack CLI 0.71.0 identifies remote custom add-ons by URL rather than retained stable IDs, so direct Webhooks raw-JSON installation cannot resolve `postgres-jobs` unaided. The generic catalog transport (`bun scripts/add-ons.ts serve webhooks`) maps served dependency identities without changing committed manifests and is covered by the clean fixture. Publication needs compatible immutable dependency URLs/transport or an upstream identity fix. Customized shared registry/config/migration histories still require reviewed composition; the CLI provides neither semantic merging nor an uninstall transaction. No additional framework/provider compatibility is claimed.
