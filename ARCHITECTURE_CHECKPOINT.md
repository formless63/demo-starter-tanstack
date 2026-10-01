# Architecture checkpoint after the first capability wave

Reviewed September 30, 2026 (America/New_York), against TanStack commit `9cce99e3822a8f72fcae68825de7bd0ab15fe2eb`. This is an engineering audit, not implementation of a capability. No application, configuration, migration, dependency, hook, or distributable changes were made.

## Verdict and evidence

The architecture is sound enough to continue after focused corrections. The sparse capability graph, native framework composition, explicit migrations, independent primitives, and separate reference application are appropriate for this starter. One High defect undermines the documented PostgreSQL persistence contract; several Medium issues concern Jobs recovery/process ownership, producer configuration, HTTP input bounds, and add-on composition. They require targeted repairs, not a stack replacement or broad architecture refactor. Green CI proves the tested paths, but does not prove named-volume persistence, startup recovery, or arbitrary combinations of independently generated migration histories.

Finding totals: **Critical 0; High 1; Medium 6; Low 7**. Observations and accepted limitations below are not included in these counts. Every numbered finding states current defect versus future risk, scope, timing, and a concrete recommendation. Scope describes the recommended correction, rather than the worst possible future redesign.

Evidence collected in this pass:

- Read `AGENTS.md`, `ROADMAP.md`, `README.md`, `docs/{CAPABILITIES,STARTING-A-PROJECT,AGENT-AUTOMATION}.md`, catalog/schema, all eight capability contracts and their declared evaluations, `.agents/context/{architecture,stack,commands}.md`, and capability-change/release-verification skills.
- Inspected actual reusable assets, compiled metadata, fixture commands, source imports, runtime/process code, SQL/journals, Docker/Compose, CI and hook adapters. Byte comparisons of root versus reusable integration source found only the expected application composition differences: Jobs registry and API Projects handler.
- `bun install --frozen-lockfile`, `bun run agents:check`, `bun run capabilities:status`, `bun run capabilities:check`, and `bun run check` passed. The latter ran governance, Biome, TypeScript, **188 tests with zero failures**, and the production build. Existing upstream module-directive build warnings remain non-fatal.
- Latest successful main CI: [run 36809122646](https://github.com/formless63/demo-starter-tanstack/actions/runs/36809122646), same reviewed commit, all ten jobs successful. This includes the eight independent add-on jobs and the production/reference verification job. Its evidence supports existing provider, migration, worker and container behavior; provider suites were not redundantly rerun during this document-only audit.
- Read-only Docker inspection and PostgreSQL `SHOW data_directory` establish finding A01. Isolated in-process pg-boss test doubles establish A03/A07; a disposable catalog copy establishes A08; bounded synthetic HTTP/logging probes establish A05/A09. None used production data or external recipients/endpoints.
- A selective official CLI clean-create probe selecting API Platform + Audit Log completed successfully but retained only `0000_audit_log` in the installed journal, proving A06's migration-history collision. The consumer/server were disposable and cleaned; no database or provider suite was started for this probe.
- For the explicitly requested Nuxt packaging comparison, inspected a read-only clone of [the companion repository](https://github.com/formless63/demo-starter-nuxt/tree/6b131b0e9155618f1295888f826a68c7f1166be8), commit `6b131b0e9155618f1295888f826a68c7f1166be8`. Paths prefixed **Nuxt:** below refer to that snapshot, not this repository. Its package lifecycle was inspected, not executed or certified by this pass.

## Remediation status — October 1, 2026

The original findings below are historical review evidence. This table records their disposition without rewriting the audit.

| Item | Disposition | Correction / verification or named future scope |
| --- | --- | --- |
| A01 | FIXED IN THIS PASS | PostgreSQL 18 named-volume parent mount; disposable container recreation/sentinel test and preservation migration guide. Existing live volumes are not automatically migrated. |
| A02 | FIXED IN THIS PASS | Producer disables schedule/supervise; worker retains ownership; real Jobs/Webhooks lifecycle and production worker proofs. |
| A03 | FIXED IN THIS PASS | Shared recovery/stop barrier plus worker partial-start cleanup; failed start, failed prepare and concurrent restart regression tests. |
| A04 | FIXED IN THIS PASS | Compose producer/worker Jobs env aligned; transactional canonical DB guard; credential-equivalent/different DB tests and real commit/rollback tests. |
| A05 | FIXED IN THIS PASS | Bounded actual-byte JSON reader/deadline, safe 408/413 and OpenAPI; oversized/dishonest length/stalled stream tests. |
| A06 | FIXED IN THIS PASS | Generic collision preflight, explicitly reviewed hard-dependency overlays, unified API/Audit/Jobs clean migration/runtime fixture. General public semantic merging remains an accepted publication limitation. |
| A07 | FIXED IN THIS PASS | Empty optional fallback, exact integers/booleans and identifier bounds validated before connection; malformed-value tests. |
| A08 | DEFERRED TO NAMED FUTURE CAPABILITY | Notifications: bidirectional custom-edge/reference closure governance. Project profiles independently enforce selected closure in this pass. |
| A09 | DEFERRED TO NAMED FUTURE CAPABILITY | Ops / Admin: Redis URL defense-in-depth sanitation before expanding operational logging. |
| A10 | DEFERRED TO NAMED FUTURE CAPABILITY | Notifications / Realtime: ordered application business-work drain and external-client shutdown. Appearance starts no backend work. |
| A11 | FIXED IN THIS PASS | Jobs/API explicit type/runtime/removal checks retaining data/history, run by existing catalog CI. |
| A12 | ACCEPTED LIMITATION | Current CI cost is acceptable; measured sharding remains future CI maintenance. |
| A13 | ACCEPTED LIMITATION | Authority/pointers clarified in Bootstrap docs; wholesale documentation generation remains deferred. |
| A14 | DEFERRED TO NAMED FUTURE CAPABILITY | Organizations: baseline auth/deployment validation parity. Bootstrap profile contains no credentials/runtime auth env. |

No Critical/High item or pre-wave blocker remains in the code after these repairs. Full verification is recorded in PROJECT_BOOTSTRAP_EVALUATION.md; publication limitations and future capability design remain explicit.

## 1. Capability dependency architecture

The catalog expresses the current graph accurately at the reusable-source boundary:

| Capability | Hard capability requirements | Baseline dependency / integration | External dependency when used | Reference / clean default |
| --- | --- | --- | --- | --- |
| Jobs | None | PostgreSQL, configured Drizzle | PostgreSQL | Enabled / false |
| API Platform | None | Better Auth, PostgreSQL/Drizzle, Node server | Baseline database | Enabled / false |
| Observability | None | Start and Node | Optional OTLP | Enabled / false |
| Object Storage | None | Node | S3 | Enabled / false |
| Email | None | Node-compatible execution; optional baseline auth wiring | SMTP; optional Mailpit | Enabled / false |
| Webhooks | Jobs | Node; transitive Jobs database requirements | Remote endpoint | Enabled / false |
| Audit Log | None | PostgreSQL/Drizzle; optional baseline auth actor mapping | PostgreSQL | Enabled / false |
| Cache / Coordination | None | Node | Valkey-compatible service | Enabled / false |

All eight are `done`, reference-enabled and `defaultInstalled: false`; the latter is a consumer-selection fact, not a runtime feature switch. Baseline requirements need not redundantly list every transitive foundation. Email's empty baseline requirement array is sparse metadata, not evidence of browser or edge-runtime support.

`src/integrations/webhooks/{jobs,enqueue}.server.ts` imports Jobs' `defineJob` and client, as declared. Audit accepts caller-owned database methods; Email, Storage and Cache have no database/auth/Jobs imports. Independent API Platform assets omit Audit and Observability. Optional telemetry lives in `src/lib/{storage,email,cache}.server.ts`, route call sites and `scripts/jobs-worker.ts`. Root `src/integrations/api-platform/projects-api.server.ts` imports Audit and root Jobs registry imports `src/lib/webhooks.server.ts`; these are intentional reference composition and documented removal obligations, not hidden reusable requirements.

The Jobs registry → application Webhooks definitions → Jobs types path is not a value-initialization cycle through the Jobs client. Keep dependent definitions importing the small public definition boundary rather than the registry/client back through their own composition. Existing relative imports are acceptable in copied TanStack source; Nuxt should continue importing exported package server APIs. No completed capability takes over Notifications, Authorization, Organizations, File UI or durable Realtime responsibilities.

**A08 — Low: governance does not enforce the full installation/reference dependency invariant.** Current validation gap; future risk grows with hard edges. `scripts/capabilities-check.ts` validates `requires` cycles and requires corresponding `dependsOn` entries, but does not require reference enablement to include hard requirements, nor reject a catalog-known custom `dependsOn` without the matching capability `requires`. A disposable catalog with Webhooks enabled and Jobs removed still exits zero. Root `capability-wave.test.ts` currently catches an altered reference set through its stronger all-completed expectation, but that is a reference-wave policy, not a generic dependency check. Recommend bidirectional custom-edge consistency and transitive reference closure validation with synthetic invalid catalogs; keep official baseline IDs distinct. **Scope: small. Timing: during the next relevant capability** that adds another hard edge.

The graph supports all eight requested future capabilities without changing its vocabulary. New mandatory storage/transport choices must become explicit edges at implementation time. Optional integration arrows are opportunities, not promises that every listed pairing has active instrumentation or business behavior today.

## 2. Packaging, installation and removal

TanStack uses the official pinned CLI 0.71 compiler/installer. Each capability owns `.add-on`, `.cta.json`, retained `add-on.json` and fixture metadata. `scripts/add-ons.ts:selectedAddOns`, `customDependencyOrder`, `withAddOnServer` and `cleanInstall` are catalog-driven; there is no Webhooks-only branch. Dependency-first DFS deduplicates custom dependencies, rejects cycles, rewrites their IDs only in served copies, and leaves official dependencies to the CLI. The transport is reasonable local orchestration, not a replacement generator.

Source/distributable drift is guarded at two levels: `capabilities:check` compares identities, dependencies, package additions and packaged contracts; `add-ons:test` recompiles and compares the entire retained output. The cheap checker does not compare all embedded implementation bytes; the lifecycle CI does. `compile(..., true)` writes a newly compiled artifact before reporting drift, so a failed local lifecycle test can leave the worktree dirty. That is visible and recoverable, not a silent successful drift proof.

**A06 — Medium: clean single-capability proof does not establish shared-file composition.** Current packaging limitation with concrete collisions, not a defect in the integrated root migration history. API Platform and Audit Log assets both own `drizzle.config.ts`, `drizzle/meta/0000_snapshot.json` and `drizzle/meta/_journal.json`; their journals describe different initial histories. A selective official CLI clean-create probe with both add-ons succeeded but installed a journal containing only `0000_audit_log`, omitting the baseline/API migrations despite their SQL files being present. Jobs also owns `drizzle.config.ts`; Webhooks owns `src/integrations/jobs/registry.ts`. An overlay can discard schema registration, migration entries or existing job definitions. Contracts already warn against unattended customized installs, but catalog fixtures exercise one selected capability plus hard closure, not API + Audit + Jobs combinations. Recommend a small collision inventory/preflight with an explicit stop-and-review result for journals/auth/config/registries, plus a representative combined fixture using a reviewed unified schema/history. Never concatenate journals blindly or rewrite applied history. **Scope: small** for preflight and targeted proof; a supported semantic installation/upgrade solution is **medium** separately. **Timing: now, before more capabilities** for visibility/proof; semantic merge support is a publication prerequisite.

**A11 — Low: lifecycle verification depth is uneven.** Current verification gap. `capabilities/jobs/test/clean-install.json` only checks files/dependencies and builds: no explicit full TypeScript check, operational proof or consumer removal. API Platform's fixture migrates/smokes/builds but also lacks explicit `tsc --noEmit` and removal; Start's build does not replace full TypeScript verification. Newer Storage/Email/Cache/Webhooks/Audit fixtures have stronger install/runtime/removal paths. Historical disposable root-removal evidence is useful but not maintained clean-consumer regression coverage. Recommend explicit type verification and capability-owned removal/runtime checks for Jobs/API, retaining schemas and preserving required dependencies. **Scope: small. Timing: now, before more capabilities.** No need to rerun unrelated providers to establish this metadata gap.

Nuxt packaging has stronger file ownership by construction. **Nuxt:** `packages/nuxt-*/package.json` exports built `dist` module/server entrypoints, owns implementation dependencies and declares compatible host peers; all remain `private: true`. Webhooks declares the Jobs peer and `src/module.ts:moduleDependencies`; catalog `requires` supplies package closure. Peers express compatibility/install requirements, while moduleDependencies activates the framework integration; neither should be confused with a durable worker deployment.

**Nuxt:** `scripts/packages.ts:packageClosure`, `prepareRootPackages` and `testPackage` are generic. Tests build dependency closure, stage manifests, convert `workspace:*` references to local tarballs, pack outside the workspace, install all closure archives with overrides, verify installed entrypoints/dependencies, typecheck/build/run the fixture, remove the selected package, replace application-owned config, delete `.nuxt/.output/node_modules`, frozen-install and rebuild. Retained hard packages and their owned dependencies are checked. Cleanup of generated state materially reduces false removal success from stale aliases/imports. `packageTest.removal.paths` and replacement configs are fixture instructions, not an automatic uninstaller for customized apps. No capability-specific branch in the shared lifecycle runner was found.

The Nuxt harness explicitly supplies the closure to the consumer. It therefore does not prove a future public registry can discover private Jobs automatically from Webhooks alone. Absolute local tarball references/overrides, private scope, versions, licensing and support matrix need a publication policy; do not publish fixture-staged archives. Framework-specific authoring models should remain separate rather than forcing Nuxt modules into a TanStack asset-copy model.

Another 10–20 mostly additive capabilities can use both runners. Shared-auth/schema/registry writers need A06; broad publication needs immutable/versioned artifact transport and upgrade ownership. A new universal generator/uninstaller is not justified.

## 3. Cross-capability composition

The repeated lazy configuration and small singleton patterns serve different clients and should not become a universal client factory. SMTP partial/ambiguous acceptance, S3 streaming body ownership, pg-boss worker drain and Cache reconnect/leases have materially different semantics. Domain-specific outcomes/errors are useful; an SMTP temporary rejection is not equivalent to a safe retry of a lost Cache increment acknowledgement.

Useful conventions can be standardized in documentation: validate at first use, use bounded operator options, static public errors, explicit close ownership, one-shot `check` versus mutating `smoke`, disposable infrastructure ownership, no implicit telemetry dependency. Compose profiles are intentionally domain-specific. Storage has retained volumes; Mailpit and Valkey are disposable. Their cleanup must not be flattened into one destructive helper.

Root Storage/Email wrappers repeat duration/count/outcome recording; Cache instead emits safe completion signals and catches observer failures. A small application-owned operation measurement helper may eventually remove mechanical repetition, but only after specifying observer-failure isolation and whether spans surround work or describe completed work. Preserve SMTP partial outcomes, Cache hit/miss and Jobs delivery outcomes. **Observation; no action now.** Evidence: `src/lib/{storage,email,cache}.server.ts:observe*` and Webhooks `DeliveryOptions.onResult`.

## 4. Runtime and process architecture

App, worker, application migration and pg-boss migration have separate entrypoints in one Node 24.21.0 image. Bun owns tooling/builds; runtime operational bundles target Node. `Dockerfile` copies `.output`, `drizzle` and the launcher, runs as `node`, and has no source bind mount or build-time credential layer. Keeping one immutable image for schema/worker/app revision coherence is sensible; operator smoke bundles add some size but are not executed at startup.

`scripts/migrate.mjs` and `scripts/jobs-migrate.ts` own migrations; long-lived constructors use `migrate: false`. Default queue registration uses pg-boss's non-partitioned queue metadata, not an application schema migration. SMTP/S3/Cache/target resolution are lazy. Enabled magic links require complete SMTP structure but no startup connection; Observability can export on initialization only when explicitly configured. No hidden inbound server or Cache/Email consumer is started.

**A02 — Medium: enqueue-only Jobs clients also become supervisors/schedulers.** Current process-role defect when a producer first uses Jobs. `getJobsClient()` calls `createJobsBoss()` without role overrides. Pinned pg-boss defaults `schedule` and `supervise` to true (`node_modules/pg-boss/dist/attorney.js`); `dist/index.js:#doStart`, `boss.js:start` and `timekeeper.js:start` arm maintenance/cron activity. This does not run registered business handlers in the app, but it is hidden background queue work beyond a producer role. Recommend producer construction with `schedule: false, supervise: false`, leave maintenance/scheduling explicitly owned by workers, and verify enqueue + expiry/retry/scheduling behavior with the worker present. Internal client cache timers may still exist and need lifecycle ownership. **Scope: small. Timing: now, before more capabilities.**

**A03 — Medium: Jobs caches failed initialization and does not clean partial startup.** Current recovery defect. `client.server.ts:getJobsClient` retains a rejected `clientPromise`; `stopJobsClient` awaits it before clearing it. A test double producing one startup failure yielded two calls but only one start attempt. Queue-registration failure can also leave a started client alive; `worker.server.ts:startJobsWorker` has no cleanup when queue/work registration fails. Recommend reset-on-failure with bounded `boss.stop`, clear state even on rejection, validate options before starting resources, and prevent stop/start races from returning a client being closed. Verify concurrent callers share one initialization and a later healthy attempt recovers. **Scope: small. Timing: now, before more capabilities.**

**A10 — Medium: shutdown is bounded per client but lacks one application-owned ordering contract.** Future composition risk, with existing wiring gaps. Worker drains pg-boss for 30s then telemetry for 4s, fitting its 35s Compose grace period. However `src/lib/cache.server.ts` independently registers signal handlers; a worker handler using that wrapper would close Cache at the same time the worker starts draining. Observability's app signals flush independently, Email relies on `beforeExit`, Storage has no app close/reset helper, and no app shutdown call closes `stopJobsClient()` or `db.$client`. Signal listeners are re-added whenever the Cache wrapper is recreated. The current reference does not continuously enqueue/use Cache in HTTP flows, so this is not a demonstrated stuck production request. Recommend application-owned shutdown ordering: reject new work, drain handlers/requests, close app clients/pools, flush telemetry last, with one idempotent deadline within deployment grace; avoid each wrapper independently owning process policy. Verify a handler using Cache/Email survives SIGTERM drain. **Scope: small. Timing: during the next relevant capability** that uses external clients in app/worker business flows.

## 5. Database and migration architecture

Root migration order is coherent: `0000_gray_the_fallen` baseline auth/projects, `0001_pretty_kat_farrell` API keys plus the boolean verified-email correction, `0002_even_nighthawk` new-row rate defaults, `0003_audit_log` Audit table/indexes. `src/db/schema.ts` exports the Better Auth model keys and re-exports Audit schema; its journal preserves the sequence. The image includes reviewed SQL and migration metadata. pg-boss has its own configurable schema/version gate. Domain + audit writes share a Drizzle transaction; retain declarations and applied history on removal so future generation does not propose destructive drops.

**A01 — High: PostgreSQL 18 data is outside the named volume.** Current persistence defect. `compose.yaml:services.postgres` mounts `postgres-data:/var/lib/postgresql/data`, but pinned `postgres:18.1-alpine` sets `PGDATA=/var/lib/postgresql/18/docker` and declares `/var/lib/postgresql` as its volume. Read-only inspection found an anonymous volume at the actual parent and the named volume at the unused old location; `SHOW data_directory` returned `/var/lib/postgresql/18/docker`. Existing container restarts can preserve the anonymous volume, masking the defect. Removing/recreating the stack does not reliably reattach it by named-volume identity, despite README's retain-data contract. Recommend mount the named volume at `/var/lib/postgresql` for fresh PostgreSQL 18 deployments. For any existing cluster, identify/backup its actual anonymous volume and perform a reviewed restore/copy with services stopped; merely editing the mount can start a new empty cluster and hide old data. Add a disposable sentinel persistence test across container removal/recreation using the named volume. **Scope: medium** including preservation/verification; YAML alone is trivial. **Timing: now, before more capabilities**, and before treating the Compose path as a persistent deployment. This audit intentionally does not mutate mounts or volumes.

**A04 — Medium: Jobs connection configuration and transactional enqueue can disagree.** Current optional-configuration defect. Compose passes Jobs settings to worker/jobs-migrate but not app. A custom `PGBOSS_SCHEMA` or `PGBOSS_DATABASE_URL` therefore creates one worker queue backend while a future app producer uses default `pgboss`/baseline DB. More fundamentally, `sendJobInTransaction(tx, ...)` overrides SQL execution with `fromDrizzle(tx, sql)` on the domain transaction, while `getJobsClient` initializes queues using the configured Jobs connection. A different Jobs database cannot share that transaction: missing schema errors or jobs written to a database the worker does not read are possible. Recommend shared producer/worker env pass-through, and explicitly define/guard transactional enqueue as requiring the same physical database and configured queue schema; separate connection credentials to the same database can remain valid. Document isolated Jobs databases as non-atomic producers unless an application outbox/relay is deliberately introduced. Test a non-default schema and incompatible transaction backend. **Scope: small** for wiring/guard/contract. **Timing: now, before more capabilities.** A cross-database outbox would be medium/large future work, not an audit fix.

Drizzle/PostgreSQL remain viable for Organizations, policy assignments, flags, PostgreSQL-first Search and integrations. Keep capability schema definitions owned locally, compose them once in the app, and generate one reviewed application history. A06 is the likely migration collision; it is packaging ownership, not an ORM blocker. Migration jobs are explicit release gates in documentation/CI, not enforced automatically by `depends_on` (which only waits for PostgreSQL); do not infer that `docker compose up` is a migration-aware deployment transaction.

## 6. Configuration and environment contract

SMTP uses explicit security mode, complete credentials and message bounds; S3 validates origin/credential pair/TTL and retains AWS region/provider chain; Cache validates redis/rediss, TLS verification and numeric operation limits. OTel exports require an explicit endpoint; disable/exporter flags affect only signals, not logging. Webhooks reference env belongs to app target resolution, not the signing protocol or queue payload. `VITE_APP_NAME` is the sole client env setting. Secret settings are unprefixed/server-only.

**A07 — Low: Jobs option parsing violates its own environment contract.** Current defects. `boss.server.ts:jobsDatabaseUrl` uses `??`, so `.env.example`'s empty `PGBOSS_DATABASE_URL=` prevents the documented DATABASE_URL fallback; the synthetic probe reproduced rejection. `workerConcurrency` uses `parseInt`, accepting `4garbage` as 4 (reproduced), decimals as truncated integers, and validating only after opening the boss. `PGBOSS_USE_LISTEN_NOTIFY` silently treats misspellings as false; schema validation lacks PostgreSQL's identifier byte-length bound. Recommend empty-as-absent optional values, full-string bounded integer parsing, explicit true/false parsing, and identifier bounds before acquiring resources. Keep defaults unchanged. Synchronize reusable assets/compiled output and test malformed/empty inputs. **Scope: small. Timing: now, before more capabilities.**

**A14 — Low: baseline production env validation has two divergent implementations.** Current maintainability/validation gap. `scripts/start.mjs` checks database protocol and APP_BASE_URL hostname; `src/env.ts:serverSchemaFor` accepts any URL protocol for DATABASE_URL and uses a substring localhost check for APP_BASE_URL. The worker bypasses the app launcher. Equivalent deployment inputs can therefore fail at different boundaries, and URL credentials/path/origin policies are not one explicit contract. Recommend a shared small server validation definition or parity tests for the launcher/schema, with PostgreSQL protocol and deliberate HTTP(S)/origin policy; preserve local/test exceptions and report names without values. **Scope: small. Timing: during the next relevant capability** touching auth/deployment configuration. Do not introduce a universal config framework.

Adopt a written convention for empty optional values, exact booleans/enums, safe integer ranges and laziness; keep domain parsers separate. `.env.example` is intentionally illustrative rather than an exhaustive OTEL/AWS environment reference. Cache env is absent from root production Compose: add explicit pass-through when the first app use is implemented; normal startup must remain independent of Cache.

## 7. Errors and privacy

Existing server call sites generally follow the conventions well. Email/Storage use static classified errors and safe `toJSON` with server-only causes; Cache additionally overrides inspection. Webhooks has static delivery/signature categories, refuses redirects and discards bounded response bodies. Audit rejects unsafe metadata structures/secret-like keys and maps SQL failure to a static error; it deliberately does not retain a raw cause. API responses suppress unexpected auth/driver messages and raw credentials. Jobs logs omit payloads and use generic failure messages, while queue payloads and handler outputs remain durable database data requiring application retention/minimization.

**A05 — Medium: machine API JSON parsing is unbounded before validation.** Current resource-exhaustion surface. `src/integrations/api-platform/responses.ts:parseJsonBody` calls `request.json()` without actual-byte/read-time limits. A synthetic 2,000,029-byte request containing a valid small name and a large unknown field was fully parsed and accepted by the schema. Permission checks happen first, but valid credentials can still create memory/slow-body pressure; field-length Zod validation and per-key rate limits do not bound transport bytes. Recommend bounded raw request reads, sane per-operation/default size and deadline, safe 413/timeout envelopes and matching OpenAPI/tests. Count actual bytes, not only Content-Length, and preserve native Start routes. **Scope: small. Timing: now, before more capabilities.** Webhooks' bounded inbound implementation provides a useful pattern without requiring shared domain parsing.

**A09 — Low: known Cache credential URLs evade default log sanitation.** Current defense-in-depth gap, not evidence that current Cache call sites leak. `observability/safety.server.ts:safeText` omits HTTP/PostgreSQL URLs but not redis/rediss; `sensitiveNames` lacks `cacheurl`. A synthetic reviewed-field log `{ cacheUrl: 'redis://fixture:synthetic-secret@example.test:6379' }` retained the credential. Current Cache wrapper logs only finite safe metadata and does not trigger this. Recommend omit known cache URLs/connection fields and redis/rediss strings, with root/reusable safety tests; retain the rule that unknown secrets in arbitrary strings cannot be inferred. **Scope: small. Timing: during the next relevant capability** expanding Cache/operational logging, or as an earlier small safety patch.

Do not unify safe errors into an over-general retry enum. Default console inspection of Email/Storage errors can expose non-enumerable causes even though JSON serialization is safe; current guidance forbids raw errors and Observability sanitizes Error objects. Audit IDs and job payloads can still be personal data. Access, retention, backup and erasure policies belong to an application/operator, not a blanket claim that this starter contains no PII.

## 8. Observability composition

No reusable capability hard-depends on Observability. Start middleware dynamically imports `.server` helpers; finite reviewed routes/fallbacks avoid raw URL labels, preserve CSRF and request IDs. `observeApi` uses static contract IDs; `observeJob` uses queue names for metrics and IDs only in logs/spans. Storage/Email/Cache wrappers use finite operation/outcome dimensions and numeric measurements, excluding addresses, keys, channels, tokens, target refs and bodies. Audit and Webhooks have optional composition points rather than fully installed telemetry adapters; that is consistent with optional edges.

Manual wrappers remain appropriate. Keep recording scope explicit: HTTP response creation is not streamed-body completion; worker completion with permanent Webhooks outcome is scheduler success rather than delivered success; a fresh worker span does not prove enqueue causal trace propagation. These limitations are documented. Instrument counts can be created repeatedly in current wrappers; measure overhead before caching instruments or adding a helper. Pino's recursive final JSON sanitation adds throughput cost deliberately. No benchmark establishes a bottleneck requiring change. A10 addresses shutdown ordering; no auto-instrumentation bundle is warranted.

## 9. Human, machine, signature and audit identity

`src/lib/auth.ts` owns passwordless Better Auth, verified OIDC token requirements, OAuth and awaited hashed-token magic links. Human sessions authorize the key-management server boundary. `requireApiKey` verifies `X-API-Key` once, extracts a plugin-neutral user-owned principal, checks credential grants and keeps API-key session creation disabled. Project SQL still requires ownerId predicates. Root Audit maps verified key record ID to a machine actor while ownership uses the principal userId; it never stores the raw key.

Webhook HMAC verification establishes possession of a trusted source secret, not a browser session, API key, organization membership or resource permission. Jobs/system actors must be supplied by application code. Audit identity constructors validate shape, not authority. Authorization and Organizations will need an explicit trusted request/tenant context, principal variants, membership resolution, policy evaluation and tenant predicates across browser/API/jobs/webhook flows. Credential scope must intersect domain authorization rather than grant tenant access by itself. Do not create fake service users or overload API permissions as general RBAC. **Observation; preserve these boundaries.**

## 10. Cache and coordination boundaries

`cache.server.ts` exposes bounded strings/bytes, exact-key deletion, atomic TTL counters, token-checked advisory leases and dedicated pub/sub clients. Namespaces separate data, leases and channels. Default writes expire; `setWithoutExpiry` is explicit. Complete connect/command deadlines and force-destroy prevent endless pending responses; observer errors cannot alter results. Separate Valkey Compose disables persistence and overrides the image volume with tmpfs.

This is the right level for future API rate limiting, ephemeral coordination and Realtime fanout. An atomic fixed-window counter is a primitive, not a complete identity/rate policy. Pub/sub has no replay or acknowledgement; a subscriber count is not delivery confirmation. Leases have no fencing/quorum and can expire under pauses/partitions/eviction; irreversible work needs database uniqueness/transactions or fencing. Current warnings are sufficient. Do not substitute Cache for durable Jobs, audit/replay storage or tenant truth. A10 applies when subscriptions/leases become part of a live app lifecycle. **Observation; no abstraction change.**

## 11. Webhooks → Jobs as the first hard edge

Catalog `requires: ['jobs']`, add-on `dependsOn: ['postgres-jobs']`, dependency-first transport and clean Webhooks fixture agree. Removal deletes Webhooks definitions and rebuilds/smokes retained Jobs, preserving queue data. Reusable Jobs has no Webhooks import; only root/dependent registry composition does. Payload contains targetRef/eventId/type/stable body; targets/secrets are resolved lazily each attempt and never queued. Bodies are durable and must be minimized.

Protocol signing uses exact bytes, stable ID/body and fresh attempt timestamps, constant-time digest comparisons and rotating secrets. Retryable delivery failures throw; permanent failures return `{ outcome: 'permanent' }` so pg-boss completes once. Consumers must inspect delivery outcome. Retained job-ID dedupe is temporary, inbound timestamp/signature tolerance is not replay protection, and durable handoff uniqueness/enqueue must share one app transaction. DNS rebinding/egress protection is intentionally application-owned.

The hard-edge model is a good template after A03/A04/A06/A07/A11. Notifications can require Jobs and compose Email optionally; Import/Export can require Jobs + Storage; File UI can require Storage without inventing DB requirements in Storage. Business integrations needing provider-specific signatures (for example Stripe) must use their provider protocol adapter rather than assume Standard Webhooks verification is universal. Their Jobs/Webhooks edges should follow actual use.

`enqueueWebhook` relies on queue defaults, while typed `sendJob` supplies policy per send; `ensureJobQueues:createQueue` does not update an existing queue's policy. Contracts state this correctly. Before any future queue policy upgrade, use explicit reviewed update tooling and a migration/compatibility test for pre-existing queue rows. Likewise, registry object spread can overwrite duplicate names; a future multi-handler composition helper should reject collisions and decide whether several target resolvers share one delivery dispatcher. These are **accepted v1 limitations**, not evidence that today's single resolver is broken.

## 12. Audit future compatibility

The generic actor/action/subject model is appropriate for Notifications and business integrations; caller transaction ownership makes required auditing atomic. Lack of organizationId/tenantId remains the right decision while no tenancy domain exists. Encoding tenant authority implicitly inside actor IDs or arbitrary metadata would be worse.

When Organizations exists, add an explicit nullable organization/scope column through a new reviewed migration, define the meaning/access policy for historical null rows, backfill only rows whose scope is provable, and introduce tenant-leading time/id indexes for actual query paths. Then require scope on tenant-bound append paths and apply scoped queries at the authorized application boundary. Global/system events may remain explicitly unscoped. Consider null/global policy and cursor/filter consistency before tightening constraints; do not guess historical tenancy. This is **medium work during Organizations**, normal feature schema evolution rather than current Audit debt or a blocker. No change was made.

## 13. Agent and coding harness

Canonical compact `AGENTS.md`, progressive contexts, domain skills, portable prompts and shared hook policy remain useful. Claude symlinks avoid duplicated skill content; Codex/Gemini adapters delegate to common hooks. `agents:check` validates required files and event shapes; `agents:test` exercises synthetic payloads/disposable Git state in hosted CI. `capability-change` Definition of Done requires independent lifecycle, reference integration and affected production/full CI verification. Cheap completion hooks deliberately do not run provider services, full builds or browser tests.

The hook lexer explicitly fails open on ambiguous shell syntax and is a footgun guard, not an approval/security boundary. No more hook events are justified. The Codex adapter's PreToolUse matcher lists `Bash|Write|Edit|MultiEdit|apply_patch`, while the shared guard also understands `exec_command`; validate actual client-emitted tool names during the next adapter compatibility update. Synthetic schema tests alone cannot prove interception by every client version. This is an **observation** pending runtime-client evidence, not a claimed bypass defect.

`session-context.ts` truncates at 32 recognized fields, exactly eight current capabilities; future sessions will omit later status entries. Keep startup output bounded, and prioritize relevant/enabled summaries or point to the status command when expanding. `capability-wave.test.ts` intentionally has a minimum wave list and Email regression assertions; it allows additional completed IDs and derives matrix/full enablement from catalog. Do not turn that reference regression into generic install tooling. A08/A11 identify the actionable governance/DoD enforcement gaps; full CI rather than hooks owns expensive correctness.

## 14. CI cost and coverage

Main CI is genuinely broad: one production image, explicit application/Jobs migrations and doctor/smoke, root telemetry, Cache Node bundle/Valkey, Storage providers/UI/production bundle, SMTP Chaos/real auth/production delivery, tests/build/browser, then normal endpoint-free app/worker probes. Eight isolated hosted runners independently prove clean consumers. This separation catches dependencies accidentally supplied by the reference app. It does not test A01 persistence, startup failure recovery, or all add-on combinations.

**A12 — Low: lifecycle cost scales linearly while the root job serializes provider verification.** Future operational cost, not current excessive latency proven by the run. Latest main verify took **225s**; add-on jobs **25–52s** each after matrix discovery. Their complete job durations sum to **310 runner-seconds**, excluding the catalog/root jobs and queue time. At 20 capabilities with similar durations that alone is roughly **775 runner-seconds**; 28 capabilities roughly **1,085**, with no assumption of identical future providers or available unlimited runner concurrency. Root cost depends on how many new integration suites are serialized, not merely capability count. Storage/Email/Cache fixtures build installed/removal consumers and the harness builds afterward; some repeated builds are necessary to distinguish pre-backend and post-removal states. Each matrix job also gets PostgreSQL even for backendless capabilities.

Recommend retain the full catalog matrix, bound its parallelism when infrastructure limits justify it, cache tool/dependency/image layers, and split root static/browser/container integration and isolated provider verification by dependency on a single uploaded production-image artifact. Preserve root telemetry/auth integration and endpoint-free startup, not just isolated primitives. Share a completed phase result only when it proves the same consumer state; never remove post-removal builds to save time. Use capability-declared fixture infrastructure to avoid irrelevant databases later. **Scope: medium. Timing: later**, driven by measured queue/runtime cost.

Provider suites use unique project/container identities/random ports and owned cleanup. Jobs/Webhooks smoke mutates queue policy temporarily and requires a disposable DB with no other workers. Preserve that serial section; placing it alongside a running worker or another smoke using the same schema can steal jobs/reset policy. Audit tests create owned DBs. Hosted matrix isolation permits parallel jobs; same-workspace parallel fixtures need per-suite DB/schema/port ownership. Provider duplication across root and clean fixture is useful: installation and application composition are different contracts.

## 15. Documentation architecture

Dependency/status/default/reference facts agree across catalog, ROADMAP, README and contracts after integration. Evaluation documents contain historical implementation counts/versions and branch-local evidence, not live claims about the current eight-capability wave. Keep that distinction explicit rather than continuously rewriting history. The integration report is a merge/verification record, not the current architecture authority.

**A13 — Low: live contract facts are repeated across too many documents.** Current maintenance cost/future contradiction risk. README, ROADMAP, `docs/CAPABILITIES.md`, starting guide, context stack and every contract repeat versions, capability counts, verification lists and removal details. For example Storage contract still says 'all four clean add-on fixtures', Webhooks records its earlier five-suite verification, and README's verification list is a selective older list; these are not evidence of missing current CI jobs but ambiguous when phrased as current instructions. Recommend make machine catalog authoritative for status/edges/env metadata; contracts authoritative for runtime/install/removal/upgrade semantics; README a short user entry; starting guide a sequence linking exact contracts; context docs concise pointers/boundaries; evaluations dated decision/evidence records. Render tables from catalog or check stable facts where that reduces edits; avoid generating prose or duplicating whole recipes. **Scope: small. Timing: later.** No documentation source was changed during this audit.

## 16. Upcoming capability readiness

These are readiness assessments, not an implementation order. A01 and the focused pre-wave corrections below apply across the starter; 'ready' does not waive those repairs.

| Capability | Readiness | Architectural basis / necessary prework |
| --- | --- | --- |
| Search | READY WITH SMALL PREWORK | PostgreSQL-first design fits; establish reviewed schema composition/migration install path under A06 before another schema-owning add-on. Query/index/domain authorization design belongs to Search. |
| Realtime | READY WITH SMALL PREWORK | Native authenticated server delivery and optional Cache pub/sub fit. Define connection/drain ownership under A10, transport proxy/timeouts, authorized channels and explicit loss/reconnect semantics. No durable broker replacement is implied. |
| Notifications | READY WITH SMALL PREWORK | Jobs hard edge and optional Email/Realtime/Audit are appropriate; correct producer role/recovery/config under A02–A04/A07 and prove safe registry composition. Delivery idempotency/partial acceptance are feature design. |
| Import / Export | READY WITH SMALL PREWORK | Jobs + Storage primitives fit; producer/transaction constraints, shared registry composition and shutdown need the same corrections. Persist sessions/results and authorize objects within the new workflow. |
| Organizations / Tenancy | READY WITH SMALL PREWORK | Better Auth and owner predicates provide a baseline; agree trusted tenant context/principal extension and unified migration ownership. Audit tenancy migration is normal implementation scope, not a prerequisite tenant column today. |
| Authorization | READY | Human and machine boundaries are explicit; native domain queries are accessible places to apply policy. Add policy evaluation and negative isolation tests; API grants remain credential limits, not general authorization. |
| Feature Flags | READY WITH SMALL PREWORK | Database-first feature definitions fit; A06 must govern installed migration composition. Optional tenancy/policy/Cache stays optional unless a specific implementation requires it. |
| Ops / Admin | READY WITH SMALL PREWORK | Optional adapters and explicit checks/outcomes exist; A05 HTTP limits plus authorized operational surfaces are necessary. Distinguish scheduler completion from delivery success and never expose raw causes/payloads by default. |

None is blocked by an architectural issue requiring replacement of the current foundation. No capability is ranked or selected next.

## 17. Would we build it this way today?

Yes, given the exact requirements, with the targeted corrections above and explicit distribution limits.

| Decision | Build this way today? | Reason / alternative and migration cost where conditional |
| --- | --- | --- |
| Overall TanStack/React/TypeScript, Bun tooling, Node production | Yes | Native routing/server functions and provider-neutral Node output fit. Pinned Nitro beta is an explicitly evaluated build adapter, not a claim that every dependency is stable; revisit on a supported upstream release, not an invented blocker. |
| Capability packaging | Yes for owned starter/clean scaffolds; conditional for broad unattended distribution | Official asset compiler plus independent fixtures fit today's scope. For customized public consumers, retain add-ons but use a supported collision-aware merge/upgrade path or move suitable pure primitives into versioned server packages with app-owned glue. **Medium** effort for focused publishing/composition; **large** for migrating all framework glue. Nuxt's native private publish-shaped modules should remain modules. |
| pg-boss | Yes | Existing PostgreSQL, transactional enqueue and separate worker are valuable. A02–A04 are configuration/lifecycle repairs. BullMQ would add Redis durability/operations and lose same-DB atomic enqueue without an outbox; **medium/large** migration with no current advantage. |
| Better Auth | Yes | Mature passwordless sessions/providers and official machine key plugin avoid a second credential system. Future principal/policy extension is ordinary feature work. |
| Drizzle | Yes | Explicit SQL, schema ownership and caller transactions fit; add-on journal collision does not justify ORM replacement. |
| PostgreSQL | Yes | One durable database serves domain/auth/audit/jobs. Fix the Compose mount; replacing the database would not fix packaging/lifecycle errors. |
| Pino + explicit OTel SDK/OTLP | Yes | Backendless logs, bounded manual dimensions and supported server middleware meet scope. No benchmark or missing contract warrants blanket instrumentation. |
| S3 primitives / AWS SDK | Yes | Private streaming/presigning/multipart are portable; application authorization/upload approval remains explicit. |
| Nodemailer SMTP | Yes | Provider-neutral mature MIME/TLS with honest acceptance/partial outcomes. A vendor HTTP API is only warranted by specific delivery features, not current requirements. |
| Valkey / node-redis | Yes | Small protocol subset, real Valkey evidence and Node compatibility fit ephemeral primitives; GLIDE/ioredis would add migration/packaging work without a current blocker. |
| Standard Webhooks signing + Jobs | Yes | Exact-byte HMAC, lazy targets, durable existing worker and bounded outcome-aware retries fit. Provider-specific protocols remain adapters; do not market universal signature support. |

No wholesale tool substitution is recommended. Conditional publication is a concrete scope boundary, not a reason to redesign the current application.

## 18. Architecture debt register

Only actionable numbered findings are registered here. Accepted limitations below are not added to severity totals.

### Fix before next capability wave

| ID | Finding | Severity | Fix timing | Scope | Affected capabilities |
| --- | --- | --- | --- | --- | --- |
| A01 | PostgreSQL 18 named volume misses actual PGDATA; preserve existing cluster and prove recreation persistence | High | Now, before more capabilities | Medium | Baseline database, Auth, API, Audit, Jobs |
| A02 | Enqueue-only pg-boss client starts supervision/scheduling | Medium | Now, before more capabilities | Small | Jobs, Webhooks; future durable consumers |
| A03 | Failed/partial Jobs initialization cannot recover or reliably clean up | Medium | Now, before more capabilities | Small | Jobs, Webhooks |
| A04 | App/worker Jobs env differs; isolated Jobs database conflicts with transaction enqueue | Medium | Now, before more capabilities | Small | Jobs, Webhooks; future transactional producers |
| A05 | API request JSON lacks actual-byte and read-time bounds | Medium | Now, before more capabilities | Small | API Platform |
| A06 | Shared add-on config/journals/registry collide; add preflight and representative combined proof | Medium | Now, before more capabilities | Small | API Platform, Audit, Jobs, Webhooks |
| A07 | Empty Jobs URL fallback and strict option parsing are incorrect | Low | Now, before more capabilities | Small | Jobs, Webhooks |
| A11 | Older Jobs/API clean fixtures lack maintained type/removal depth | Low | Now, before more capabilities | Small | Jobs, API Platform |

### Fix during relevant future capability

| ID | Finding | Severity | Fix timing | Scope | Affected capabilities |
| --- | --- | --- | --- | --- | --- |
| A08 | Generic governance omits reference dependency closure/reverse custom-edge consistency | Low | Next hard dependency capability | Small | Capability governance |
| A09 | Default sanitation misses redis/rediss credential URLs and Cache URL field | Low | Next Cache/operational logging integration | Small | Observability, Cache |
| A10 | Application drain/client-close/telemetry order is fragmented | Medium | Next live app/worker external-client workflow | Small | Jobs, Cache, Email, Storage, Observability, DB |
| A14 | Launcher and baseline env validator disagree | Low | Next auth/deployment configuration change | Small | Baseline Auth/DB, process entrypoints |

### Long-term / publication concerns

| ID | Finding | Severity | Fix timing | Scope | Affected capabilities |
| --- | --- | --- | --- | --- | --- |
| A12 | Serial root integration and repeated lifecycle infrastructure grow runner cost | Low | Later, after measurement | Medium | CI and all lifecycle fixtures |
| A13 | Repeated live documentation facts accumulate stale instructions | Low | Later | Small | All capability/governance docs |

A06's public installation/upgrade solution remains a **medium publication concern** beyond its small pre-wave preflight. Custom dependency URL identity, immutable/versioned artifacts, licensing/support and private Nuxt package release policy must be resolved before external publication; they are accepted current scope limits rather than additional urgent findings.

### Explicitly accepted limitations

- Manual customized installation/removal; no semantic CLI uninstall transaction. Preserve applied schema/migration history and remote data.
- No external publication contract yet; Nuxt packages stay private and TanStack custom hard dependencies use local compatible transport.
- Webhook delivery is at least once, retained-ID dedupe is temporary, inbound replay/target DNS-egress policy is application-owned, and queue policy upgrades are explicit.
- Cache is ephemeral; leases are advisory without fencing, pub/sub can lose messages, command timeout can leave an unknown mutation outcome.
- SMTP acceptance/partial acceptance is not inbox delivery; S3 signed URLs are replayable and HEAD approval is post-upload/non-atomic.
- Audit is append-oriented API behavior, not database immutability; tenancy/access/retention are application policy and future explicit migrations.
- OTel HTTP coverage ends at response creation; worker causal trace propagation and browser telemetry are deferred. IDs can be personal data even when excluded from metric labels.
- Hook guards are bounded convenience checks and rely on normal client trust/sandbox/approvals. Provider-heavy verification belongs to task/CI workflows.
- Node production, explicitly selected pinned build adapter, tested provider subset and credential-free OAuth test boundaries; no universal edge/provider certification.

Complete the focused pre-wave repairs above, then continue capability work. A separate broad architecture refactor pass is **not required**.
