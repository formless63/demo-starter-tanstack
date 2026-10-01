# Baseline repair verification ledger — 2026-10-01

Scope: Better Auth 1.7.7 release alignment, native Jobs process roles/handler context, Project name 120/description 1000, and shared CI Node 24 lifecycle setup. Base: `1b648c3925bc56ec4da5f6611eb2f2defb28c55e` on `origin/main`. No planned capability implementation, publication, production service, provider credential, grant, or migration-history change.

## Local results

Tooling: official Bun 1.4.2 (`744846f84`), Node v24.19.0, PostgreSQL 18.1 in the disposable development environment. Production image and hosted CI pin Node 24.21.0. Tool caches use writable workspace directories; repository installation/CI logic has no environment-specific workaround.

| Verification | Result |
| --- | --- |
| Frozen Bun install and matching core/internal core/Drizzle adapter/API Key 1.7.7 | Passed |
| Targeted auth, Magic Link, API-key, Project, Jobs lifecycle/transaction/retry/cancellation/schema gates | Passed |
| Full `bun run check` (harness/governance/profile/theme/lint/types/tests/build) | Passed |
| Final `bun test` after expanded auth regressions | 277 passed, 0 failed |
| Agent hook fixtures | 128 passed |
| All eight completed add-on install/runtime/removal/build lifecycles | Passed: Jobs, API Platform, Observability, Object Storage, Email, Webhooks, Audit Log, Cache / Coordination |
| API/Audit/Jobs clean composition | Passed; schema and migration history retained |
| Jobs doctor/smoke, API-key smoke, Observability, Audit Log, Webhooks | Passed |
| Valkey compatibility/restart/recovery and optional cache telemetry | Passed |
| RustFS/Garage common contract plus Garage UI | Passed |
| Real SMTP/Chaos and reference Better Auth hash/session/replay/telemetry fixture | Passed |
| PostgreSQL volume persistence/recreation fixture | Passed |
| Development browser suite | 9 passed |
| Explicit production Node build and browser suite | 9 passed |
| Production Node health, request correlation, OpenAPI request bounds, Scalar probes | Passed |
| Bundled Node Jobs explicit migration/doctor/smoke and worker startup/SIGTERM drain | Passed |
| Local production Docker image path | Environment blocked: see below; hosted verification required |
| Applied migration history / project SQL columns | Unchanged; existing text columns require no widening migration |
| Compiled Jobs/API Platform assets and catalog governance | Passed |

Corrections found during verification were resolved and rerun: native form validation error rendering and quote-normalized clean fixture expectations. The official TanStack Better Auth foundation retains its native package declaration; the API lifecycle checks actual resolved release alignment before runtime work, rather than rewriting installed packages.

## Container environment limitation and hosted gate

A normal `docker compose build app` reached the frozen install but stalled because the disposable environment's container network cannot reach the npm registry. A read-only probe from the official `oven/bun:1.4.2` image returned `TypeError`, code `ConnectionRefused`, for `https://registry.npmjs.org/better-auth/1.7.7`. The blocked build was stopped. The migration entrypoint deliberately targets `/app/drizzle`, so its container path is verified in hosted CI; normal host Drizzle migration passed locally.

The existing hosted `verify` job builds the immutable Node 24.21.0 image, runs both explicit migrations, Jobs doctor/smoke and Webhooks, real production SMTP, app/worker health and production browser checks. The shared `custom-add-ons` matrix runs all completed lifecycles. Both runtime jobs now install Node 24.21.0, assert major 24, and print exact Node/Bun versions before fixtures. Hosted check results and the exact head SHA are recorded on the draft PR and in the handoff; merge remains coordinated.

## Security/compatibility evidence

The [official Better Auth release](https://github.com/better-auth/better-auth/releases/tag/v1.7.7) and [advisory](https://github.com/better-auth/better-auth/security/advisories/GHSA-965c-763c-88jm) identify 1.7.7 as patched. Existing hashed Magic Link tokens with global identifier hashing unset match a documented mitigation; no prior exposure is asserted. Purpose prefixes make pending pre-upgrade links/state unusable; request new links and restart pending sign-in flows during a coordinated upgrade. No auth schema migration is required.

pg-boss stays 12.35.0. Native `Job` provides `id`, `signal`, `retryCount`; `JobWithMetadata` adds persisted `retryLimit`, enabled by `includeMetadata: true`. Native cancellation is not interpreted as terminal. Tests prove send-time retry overrides, expiration and close/replacement retries, payload-only handlers, same-database transaction rollback, and doctor failure on drift independently of version checks. Sources: [constructor](https://github.com/timgit/pg-boss/blob/12.35.0/docs/api/constructor.md) and [workers](https://github.com/timgit/pg-boss/blob/12.35.0/docs/api/workers.md).
