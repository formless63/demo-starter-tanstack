# Reusable capabilities

## Capability model

The starter separates its always-present baseline from optional reusable capabilities.

- **Baseline:** framework, TypeScript/Bun/Node tooling, PostgreSQL/Drizzle, passwordless Better Auth, styling/components, containers, testing, and agent scaffolding.
- **Capability:** an independently installable feature contract with implementation assets, dependencies, operational impact, verification, and removal guidance.
- **Reference application:** the root application in this repository. It enables all completed capabilities to keep their integration and deployment paths continuously tested.
- **Generated consumer:** a clean application scaffold. It receives a capability only when the capability is explicitly selected or installed.

The presence of `capabilities/<id>/.add-on` in this repository means the add-on can be authored and tested here. It does not make that capability part of every generated consumer. Likewise, entries in `ROADMAP.md` with planned/deferred status are architecture intent; no implementation exists merely because a row is present.

`defaultInstalled` has one definition: whether a clean base/generated consumer receives the capability without explicitly selecting or installing it. It does not describe the root reference application.

## Completed capabilities

All twenty completed capabilities are reference-enabled and opt-in for clean consumers.

| ID | TanStack add-on ID | Status | Reference app | Default installed | Official add-on dependencies | Reusable capability requirements | External | Contract |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ops-admin` | `ops-admin` | Done | Yes | No | `better-auth`, `drizzle` | None | None additional | [Ops / Admin](../capabilities/ops-admin/CAPABILITY.md) |
| `jobs` | `postgres-jobs` | Done | Enabled | No | `drizzle` | None | PostgreSQL | [Jobs](../capabilities/jobs/CAPABILITY.md) |
| `api-platform` | `api-platform` | Done | Enabled | No | `better-auth`, `drizzle` | None | None beyond baseline PostgreSQL | [API Platform](../capabilities/api-platform/CAPABILITY.md) |
| `observability` | `observability` | Done | Enabled | No | None | None | Optional OTLP | [Observability](../capabilities/observability/CAPABILITY.md) |
| `object-storage` | `object-storage` | Done | Enabled | No | None | None | S3 only when used | [Object Storage](../capabilities/object-storage/CAPABILITY.md) |
| `command-system` | `command-system` | Done | Enabled | No | None | None | None | [Command System](../capabilities/command-system/CAPABILITY.md) |
| `data-table` | `data-table` | Done | Enabled | No | None | None | None | [Data Table](../capabilities/data-table/CAPABILITY.md) |
| `charts-visualization` | `charts-visualization` | Done | Enabled | No | None | None | None | [Charts / Visualization](../capabilities/charts-visualization/CAPABILITY.md) |
| `email` | `email` | Done | Enabled | No | None | None | SMTP only when used; optional Mailpit | [Email](../capabilities/email/CAPABILITY.md) |
| `webhooks` | `webhooks` | Done | Enabled | No | `postgres-jobs` | Jobs | Remote endpoints when used | [Webhooks](../capabilities/webhooks/CAPABILITY.md) |
| `audit-log` | `audit-log` | Done | Enabled | No | `drizzle` | None | PostgreSQL | [Audit Log](../capabilities/audit-log/CAPABILITY.md) |
| `cache-coordination` | `cache-coordination` | Done | Enabled | No | None | None | Valkey/Redis-compatible service on use | [Cache / Coordination](../capabilities/cache-coordination/CAPABILITY.md) |
| `ai` | `ai` | Done | Enabled | No | None | None | Model endpoint only on use | [AI](../capabilities/ai/CAPABILITY.md) |
| `search` | `search` | Done | Enabled | No | `drizzle` | None | PostgreSQL only | [Search](../capabilities/search/CAPABILITY.md) |
| `realtime` | `realtime` | Done | Enabled | No | None | None | Optional Cache backplane | [Realtime](../capabilities/realtime/CAPABILITY.md) |
| `notifications` | `notifications` | Done | Enabled | No | `postgres-jobs` | Jobs | Optional ntfy; optional Email adapter | [Notifications](../capabilities/notifications/CAPABILITY.md) |
| `import-export` | `import-export` | Done | Enabled | No | `postgres-jobs`, `object-storage` | Jobs, Object Storage | None additional | [Import / Export](../capabilities/import-export/CAPABILITY.md) |
| `invoice-ninja` | `invoice-ninja` | Done | Enabled | No | `postgres-jobs`, `webhooks` | Jobs, Webhooks | Invoice Ninja on use | [Invoice Ninja](../capabilities/invoice-ninja/CAPABILITY.md) |
| `stripe` | `stripe` | Done | Enabled | No | `postgres-jobs`, `webhooks` | Jobs, Webhooks | Stripe on use | [Stripe](../capabilities/stripe/CAPABILITY.md) |
| `medusa` | `medusa` | Done | Enabled | No | `postgres-jobs`, `webhooks` | Jobs, Webhooks | Medusa 2.21.2 on use | [Medusa](../capabilities/medusa/CAPABILITY.md) |

Run `bun run capabilities:status` to render these facts from the catalog and current add-on source.

## Installing a capability

The distributable for each completed capability is the committed `capabilities/<id>/add-on.json`. TanStack CLI consumes custom add-ons by URL. Use a URL for the compiled JSON—such as the raw file in this repository or the equivalent URL in your fork—and run the command in a TanStack CLI scaffold that has `.cta.json` metadata.

To create a clean application with Jobs:

```bash
bunx @tanstack/cli@0.71.0 create my-app \
  --framework React \
  --package-manager bun \
  --add-ons https://raw.githubusercontent.com/formless63/demo-starter-tanstack/main/capabilities/jobs/add-on.json \
  --add-on-config '{"drizzle":{"database":"postgresql"}}' \
  --no-git --no-intent --yes
```

To create a clean application with API Platform:

```bash
bunx @tanstack/cli@0.71.0 create my-app \
  --framework React \
  --package-manager bun \
  --add-ons https://raw.githubusercontent.com/formless63/demo-starter-tanstack/main/capabilities/api-platform/add-on.json \
  --add-on-config '{"drizzle":{"database":"postgresql"}}' \
  --no-git --no-intent --yes
```

For an existing TanStack CLI-created application, run from its root:

```bash
bunx @tanstack/cli@0.71.0 add https://raw.githubusercontent.com/formless63/demo-starter-tanstack/main/capabilities/jobs/add-on.json
```

Replace the URL with the API Platform, Observability, Storage, Email, Audit Log, Cache AI or Search distributable (Webhooks uses the dependency transport described below) to select that capability. Review the resulting diff, configure its environment, apply any declared migrations, and run its `CAPABILITY.md` verification. Observability has no migrations or database dependency. The repository's `bun run add-ons:test <id>` harness serves the same compiled JSON locally and verifies the clean-create flow in a disposable scaffold.

Official TanStack add-on dependencies are resolved by the CLI:

- Jobs declares `dependsOn: ["drizzle"]` because it needs an actual configured Drizzle integration.
- API Platform declares `dependsOn: ["better-auth", "drizzle"]` because Better Auth alone does not provide its PostgreSQL/Drizzle persistence boundary.
- Observability declares `dependsOn: []`; its clean fixture proves signals and real optional OTLP export without Jobs, API Platform, authentication, or a database integration.
- Object Storage declares `dependsOn: []`; its clean fixture rejects database/auth/Jobs/API/telemetry installation, builds backendless, tests real RustFS and Garage, then removes AWS/runtime additions and rebuilds. Local profiles and admin UI are optional infrastructure, not capability dependencies.
- Email declares `dependsOn: []`; a backendless fixture types/builds with SMTP absent, tests real Mailpit SMTP/Chaos, then removes runtime/packages and rebuilds. Better Auth and telemetry are root-only integrations, never clean-consumer requirements.
- Webhooks declares `dependsOn: ["postgres-jobs"]`; the generic transport resolves custom Jobs and transitive official Drizzle dependencies.
- Audit Log declares `dependsOn: ["drizzle"]`; the fixture proves real migrations, coupled transactions and retained history on removal.
- Cache declares `dependsOn: []`; the fixture proves backendless installation, actual Valkey and removal without touching external data.
- AI declares `dependsOn: []`; the fixture proves backendless installation/build, actual local OpenAI-compatible HTTP generation/streaming/structured/cancellation and clean runtime removal/rebuild. Application telemetry remains outside the assets.

- Search declares `dependsOn: ["drizzle"]`; it installs only helpers/smoke/docs. Domains define their generated vector/GIN and create a new reviewed migration. Disposable fixture SQL is never a production model.

These IDs are framework add-on dependencies. They are not entries in the reusable capability `requires` graph. Webhooks requires Jobs; optional integrations remain independent.

## Disabling or removing a capability

Removal has two distinct scopes.

### Remove from the application

Remove the runtime/integration files, application-specific package dependencies and scripts, process/container wiring, tests, and shared-file registrations listed in the capability contract. Remove the capability ID from `referenceApplication.enabledCapabilities` because the root-like application no longer integrates it.

Retain database tables, schemas, and committed migration history by default. Removing code is not authorization to destroy data. For an already-deployed application, any later database deletion must be a new, explicitly reviewed migration.

The complete verified recipes are in [Starting a project](STARTING-A-PROJECT.md).

### Prune add-on authoring source from a downstream fork

After the application no longer uses a capability, a downstream fork that will never reinstall, distribute, or develop it may also:

1. Delete `capabilities/<id>/`.
2. Delete capability-specific evaluation and agent-skill files if no longer useful.
3. Keep the catalog ID when other roadmap entries reference it, set its status to `deferred`, and remove implementation-only fields such as scripts, environment, migrations, runtime services, documentation/skill/evaluation paths, and `tanstackAddOn`.
4. Update `ROADMAP.md` and user-facing docs.
5. Run `bun run capabilities:check`.

Keeping the stable catalog ID avoids breaking planned relationship references. This pruning is repository maintenance, not application uninstall behavior.

TanStack CLI currently has no automatic uninstall transaction for custom add-ons. Installing an add-on does not give the CLI enough semantic information to reverse arbitrary later TypeScript edits, so this starter does not pretend otherwise.

## Shared-file caveat

Additive capabilities such as Jobs are comparatively straightforward: they mostly add owned files and scripts around a baseline integration.

API Platform also registers a Better Auth plugin and extends the shared Drizzle schema. Its clean-scaffold installation is tested, but the official custom add-on format copies assets rather than semantically merging TypeScript. Installing API Platform into an already-customized application therefore requires review of `src/lib/auth.ts`, `src/db/schema.ts`, migrations, and navigation/route integration. The same review is required during removal.

This caveat is why the repository provides exact manual instructions instead of a brittle general-purpose uninstaller.

Observability owns an initial `src/start.ts` middleware registration. Review/merge any existing Start configuration and preserve explicit CSRF middleware. Its independent assets contain no Jobs/API imports; optional integrations live only in reference application route/worker wiring. The existing database-backed readiness endpoint retains its status/HTTP contract with additive safe metadata.

## Dependency handling

- **Requires:** a hard dependency on another reusable capability. The capability must not claim to work without it.
- **Integrates with:** an optional enhancement. Its absence must not prevent core operation.
- **External:** infrastructure or a remote service outside the reusable capability catalog.
- **Baseline requirement:** an always-present starter foundation, not a reusable capability edge.
- **TanStack add-on `dependsOn`:** a framework installation dependency resolved by the CLI, distinct from `requires`.

Hard capability dependencies stay sparse and acyclic. Optional integrations never become hard requirements merely because they are common companions.

## Verification

```bash
bun run capabilities:status
bun run capabilities:check
bun run add-ons:test jobs
bun run add-ons:test api-platform
bun run add-ons:test observability
bun run add-ons:test object-storage
bun run add-ons:test webhooks
bun run check
```

Then run the capability-specific database/worker/API smoke commands described in each `CAPABILITY.md`.

## Webhooks

Webhooks is complete and enabled in the reference application. Its add-on declares `dependsOn: ["postgres-jobs"]`. CLI 0.71 changes custom IDs to URLs, so direct raw JSON cannot resolve the stable custom dependency ID. Run `bun scripts/add-ons.ts serve webhooks`, then use its printed `--add-ons` argument with PostgreSQL Drizzle config. The local transport maps catalog dependency IDs to served URLs without changing retained artifacts. The generic catalog harness handles that ordering for `bun run add-ons:test webhooks`. Review the shared Jobs registry composition in customized applications. See [contract](../capabilities/webhooks/CAPABILITY.md). No API Platform, Audit Log or Observability requirement.

## Audit Log

Audit Log is optional and needs only baseline PostgreSQL/Drizzle; Authentication is application actor wiring. Its official add-on declares `dependsOn: ["drizzle"]` and no consumer dependencies. It owns schema/API source, reviewed SQL and a clean install/removal fixture. Root Projects mutations transactionally append safe user/machine records. See [the contract](../capabilities/audit-log/CAPABILITY.md).

The clean scaffold gets a Drizzle config overlay including the baseline and capability schema plus an initial audit migration. Existing customized applications must manually register the owned schema and generate a new reviewed migration in their existing history; do not overwrite config or applied journals. No semantic merger/uninstaller is provided. Code removal retains audit schema/history. Operator destructive removal requires a new explicit migration. API Platform, Jobs, Organizations and business consumers remain optional; Audit Log is separate from Observability and supplies no query authorization/UI.

Verification: `bun run add-ons:test audit-log`, `bun run audit-log:smoke`, and real PostgreSQL tests under `src/integrations/audit-log` and `src/features/projects/audit.integration.test.ts`.

## Cache / Coordination

Cache / Coordination declares `dependsOn: []`; clean installation needs no database, Auth, Jobs, API, Realtime or Observability add-on. Select `capabilities/cache-coordination/add-on.json` with the same official CLI URL flow above. Backendless build and unit checks run before actual disposable pinned Valkey compatibility and clean removal/rebuild. Its protocol subset is tested on Valkey only; no second Redis implementation is claimed. Optional reference telemetry is application-owned.

Run `bun run add-ons:test cache-coordination`, `bun run cache:unit`, and `bun run cache:compat` for its standalone contract; normal root startup/readiness never requires Cache.

The four SMTP/Webhooks/Audit/Cache v1 contracts fix shared behavioral bounds while retaining native add-on packaging. Email uses combined 1 MiB bodies, subject200, counts-only results and socket10s; Webhooks bounds the complete attempt and reads no response body and does not suppress deliberate enqueues; Audit owns event time/ID and uses from-inclusive/until-exclusive ranges; Cache returns Buffer, expires default writes, uses advisory lease seconds and explicit reconnect/subscription recreation. See each contract for exact validation and ownership rules.

### Shared-file preflight and reviewed composition

Run `bun run add-ons:preflight <id ...>` before combining custom add-ons. It exits nonzero for unreviewed shared files (including journals/config); it never merges files or applies migrations. Webhooks' `installation.json` records its reviewed Jobs registry overlay, permitted only for its hard dependency. Existing customized applications still require manual diff review even when this check passes. `bun run add-ons:test:composition` proves a reviewed API + Audit + Jobs clean consumer using this reference application's unified schema/history; it is a fixture, not an installation or upgrade command for a deployed application. Public semantic upgrade/merge support remains deferred.

## Search ownership

Search requires baseline PostgreSQL/Drizzle and no capability. Jobs, Object Storage and Organizations remain optional future integrations. Application tables own authorization and typed equality filters. Compose owner predicates with explicit `simple` FTS, validate query/page/cursor input, keep descending rank/timestamp/ID order, and retain exact database rank/time for continuation. No generic public table-search function or universal search_documents table is installed. Query text stays out of logs/spans/metric labels; the root uses a session-scoped POST function. See the [contract](../capabilities/search/CAPABILITY.md) for helpers and the [evaluation](../SEARCH_MODULE_EVALUATION.md) for shared v1 defaults.

## Realtime and Notifications

These remain two independent `defaultInstalled: false` add-ons. Realtime has no custom hard dependency; Notifications requires only Jobs (`postgres-jobs` in official add-on metadata). The reference enables both. Realtime uses Node-native Nitro/H3/CrossWS WebSocket and SSE adapters; `REALTIME_TRANSPORTS` defaults to `sse`. Choose SSE, WebSocket or both explicitly during onboarding, and remove unused route wiring when appropriate. WebSocket v1 has the same server→client event semantics and no generic RPC/client-command protocol.

The reusable Realtime consumer includes reviewed provider-neutral Nitro Vite configuration, both route adapters and a default-deny application authorizer. Adapt the config with existing Vite plugins when installing into a customized app. Supply the existing human cookie session and authorized exact channels before accepting; no arbitrary logged-in subscriptions, query tokens or API keys. The reference shares its process hub between Nitro and Start module runners; restart development after registry changes. Optional `src/lib/realtime-cache.server.ts` provides an alternative single-path Cache backplane; choose it instead of local publication, subscribe explicitly, recreate after failure, and retain no replay claim.

Notifications owns durable records/read state and uses caller DB/transaction executors. Its independent adapter registry starts empty. The reference's Project creation couples domain write, Audit and notification row in one transaction, then emits only `{notificationId}` after commit; Realtime failure cannot undo persistence. The `/app/notifications` view refetches on connection/reconnection and uses recipient-authorized server functions; rendering escapes plain text. Optional Email delegates to existing Email; optional ntfy is resolved at execution. Jobs stores only notification ID/channel. Delivery completion includes a business outcome and is not an external-delivery guarantee.

`0004_tough_mindworm.sql` is the new additive reviewed root migration; previously applied files remain unchanged. Notifications removal retains schema/validation types, table/data, migrations and Jobs; Realtime removal has no database/external-data effect. See the two contracts and the starting guide for exact limits and removal edits. Generic completed-add-on discovery covers both clean fixtures; root verification additionally tests real cookie auth, optional two-process Valkey fanout and Node-worker SMTP/ntfy delivery.

The integrated migration journal retains both original additive SQL files and timestamps: Search is entry 4 (`0004_search`) and Notifications entry 5 (`0004_tough_mindworm`). Snapshot 0004 remains Search; snapshot 0005 combines both schemas and links to snapshot 0004. Applied baseline migrations are unchanged. Branch-specific deployed databases must be reviewed against their recorded migration history before upgrade.

Import / Export is completed: [contract](../capabilities/import-export/CAPABILITY.md) and [evaluation](../IMPORT_EXPORT_MODULE_EVALUATION.md). It requires Jobs + Object Storage; Notifications/Audit remain optional composition. Clean consumers remain opt-in.

Ops / Admin provides guarded read-only `/admin/ops` and `/api/ops/summary`, privileged server-only `OPS_ADMIN_USER_IDS`, explicit application-owned optional adapters, no persistence. See [capability contract](../capabilities/ops-admin/CAPABILITY.md) for installation/removal and deadline limitations.

## Invoice Ninja

Invoice Ninja v1 is completed and reference-enabled; clean consumers remain opt-in. Its independent add-on includes scoped durable operations/receipts, native routes, approved unsent drafts, exact monetary projections and data-preserving removal. Pinned native-provider, lifecycle, browser and canonical production verification passed. Deployment-specific draft policy and financial certification remain outside this acceptance. See [contract](../capabilities/invoice-ninja/CAPABILITY.md).

## Stripe

Stripe is an optional authored/compiled add-on (`stripe`, default installed: No), requiring Jobs and Webhooks. It is completed and reference-enabled after full combined lifecycle, browser, canonical container and worker verification. Local SDK/protocol/persistence fixtures establish the supported contract; no sandbox/live payment or financial certification is implied. Use `bun run add-ons:test stripe` for independent install/runtime/remove/rebuild and see the [Stripe contract](../capabilities/stripe/CAPABILITY.md) for authorization, immutable write replay, callback durability and retained-data removal.

## Medusa

Medusa v1 is completed and reference-enabled: optional bound product/order read reconciliation, Jobs + Webhooks required, clean consumers `defaultInstalled: false`. Native reference routes/UI and the pinned disposable Medusa 2.21.2 backend/subscriber bridge passed the generic lifecycle and combined production gates. No checkout/payment workflow or external deployment is certified. See [contract](../capabilities/medusa/CAPABILITY.md). All twenty completed capabilities remain opt-in for clean consumers.

## Integrated provider migration history

The combined root journal preserves entries 0–7 and their SQL/timestamps. Provider SQL is additive, with contiguous journal indices and cumulative snapshots:

- Index 8: `0009_invoice_ninja_v1.sql`, snapshot `0008_snapshot.json`.
- Indices 9–11: `0011_stripe_v1.sql`, `0012_stripe_recovery.sql`, `0015_stripe_receipt_conflicts.sql`, snapshots `0009_snapshot.json`–`0011_snapshot.json`.
- Indices 12–13: `0013_medusa_v1.sql`, `0014_medusa_receipt_conflicts.sql`, snapshots `0012_snapshot.json`–`0013_snapshot.json`.

Snapshot links continue from `0007_snapshot.json`, retaining every preceding schema at each step. SQL filename prefixes deliberately differ from journal indices; `0008` and `0010` are unused SQL prefixes. Do not reorder by filename, rewrite applied SQL or substitute branch-local metadata. Existing branch-specific deployments require an operator review of recorded migration history before upgrading. Clean add-on consumers retain their own provider-local migration journals. Apply explicit application and Jobs migrations before startup; removal preserves the combined history and data.

- Data Table (`data-table`, done, reference-enabled, optional) has no hard dependencies and uses native v9 controlled or internal state. The reference verification imports the authored component and runs the shared SSR/interactive fixture; clean consumers install the same component through the add-on. Hosted real-browser and full lifecycle verification passed. See the [contract](../capabilities/data-table/CAPABILITY.md) and [acceptance evidence](../DATA_TABLE_MODULE_EVALUATION.md).

## File UI (in-progress)

Only Object Storage is required. React UI and atomic workflow adapters are independently installed; root authentication and PostgreSQL persistence are application-owned. The clean fixture uses bounded non-durable synthetic metadata. See [contract](../capabilities/file-ui/CAPABILITY.md) for upload receipts, quarantine, operator recovery and removal. Journal index14 / SQL0016_file_ui / cumulative snapshot0014 preserve all previous migration hashes and entries. Hosted exact-head checks are required before promotion.
