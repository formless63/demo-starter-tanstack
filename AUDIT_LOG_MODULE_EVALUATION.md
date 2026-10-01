# Audit Log module evaluation

Implementation date: 2026-09-30. Scope: one append-oriented application primitive; no Email/Webhooks/Cache branch consumption, UI, Organizations, Authorization or Ops/Admin implementation.

## Research and design decisions

Reviewed official current PostgreSQL 18 documentation and Drizzle documentation/installed 0.45.x types:

- [JSON/JSONB](https://www.postgresql.org/docs/current/datatype-json.html): JSONB normalizes JSON, supports indexing, rejects unsupported input such as NUL. Drizzle `$type` is compile-time only, so runtime validation is explicit; no metadata GIN index without a query need.
- [Date/time](https://www.postgresql.org/docs/current/datatype-datetime.html): timestamptz represents instants normalized to UTC, not original zones. Precision 3 matches JS Date milliseconds and avoids cursor precision loss.
- [UUID](https://www.postgresql.org/docs/current/datatype-uuid.html): native uuid storage can accept application UUIDs. Node cryptographic randomUUID generates v4 IDs; no extension or database generation dependency.
- [Multicolumn indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html): equality prefixes followed by time/id ordering support actor/subject/action lookup; one standalone time index handles global keysets. No speculative outcome/JSON/search index.
- [Drizzle PostgreSQL columns](https://orm.drizzle.team/docs/column-types/pg): jsonb typed object, timestamptz withTimezone/precision and uuid without defaultRandom. Root reviewed SQL and an independently generated clean add-on migration reflect the schema.
- [Cursor pagination](https://orm.drizzle.team/docs/guides/cursor-based-pagination): nonunique ordering needs a unique tiebreaker. Descending timestamp + UUID strict tuple comparison prevents cross-page duplicates with tied timestamps. Explicit NULLS LAST ordering matches generated B-tree ordering.
- [Transactions](https://orm.drizzle.team/docs/transactions) and installed node-postgres driver/session type declarations: transaction inherits the database query methods. Structural picks of insert/select permit configured db or tx without app imports/casts; no independent transaction is opened. Any required audit failure must propagate through the domain callback.

Some Python documentation fetches received HTTP 403; official pages were successfully retrieved with curl and examined locally. No new third-party library was needed.

## Model, guarantees and safety

One `audit_event` table: id, createdAt, actorType/nullable actorId, namespaced action, subjectType/nullable subjectId, nullable outcome/requestId, JSONB metadata. See [CAPABILITY.md](capabilities/audit-log/CAPABILITY.md) for exact lengths/indexes/API example. No user email, credential, tenant or speculative domain columns. Actor/subject IDs have no foreign key: deletion of a domain actor/subject does not erase history. Types are extensible bounded strings. createdAt is application clock time, not a durable commit sequence or proof of ordering within a millisecond.

Append-only means INSERT/query public API. DB operators retain full administrative authority; no triggers, cryptographic tamper-proof ledger, compliance certification, purge schedule, automatic retries or exactly-once claim. Applications own access controls, truth of actor mapping, legal capture, PII minimization, retention, erasure and backups. Prefer stable IDs; secret-looking keys are rejected but innocuous names can still hide sensitive values.

Metadata uses explicit JSON-only plain-object copies, 8 KiB encoded UTF-8, depth 6, 50 keys/object, 100 elements/array, 1,024 nodes and 128-character keys. Recursively rejects normalized password/secret/token/authorization/cookie/apikey/credential keys, prototype keys, controls/malformed Unicode, errors/classes, cycles, accessors, symbols, nonfinite numbers, undefined and sparse/extended arrays. Rejecting avoids silent omission/redaction/stringification. A PostgreSQL test exposed Drizzle's inability to accept a sanitized null-prototype output; validated output is now a normal plain object with prototype keys blocked, while null-prototype input remains supported.

No body/header/session/API/job payload capture or automatic logging of data. AuditLogError only returns INVALID_EVENT/INVALID_QUERY/DATABASE_ERROR with safe messages, no raw SQL cause/row. Root HTTP retains its existing generic safe envelope.

Query defaults 50, maximum 100, one lookahead row; versioned canonical base64url cursor encodes ISO millisecond time + UUID. Validate cursor length, alphabet, structure, timestamp and canonical encoding before SQL. Filters are fixed, bounded, no OFFSET or full text/arbitrary predicate. Cursor is not encryption/signature/authorization or a snapshot; retain filters across pages. Newer inserts require a fresh query; older/backdated inserts may appear later.

## Reference and optional integrations

Root Projects create/update/delete transactionally append success with stable signed-in user IDs and static safe source/field-name context. Ownership filters and existing return/error behavior remain. Reads/denials are not audit events. Root API create maps verified principal.keyId to machine actor; principal.userId still scopes project ownership. Audit Log owns no API imports or key schema, and API Platform's independent assets are unchanged. Root tests exercise real API verification and ensure no raw key/body is recorded.

Jobs handlers can explicitly use job/system actors and caller transactions without an enqueue dependency. No Jobs integration is automatically installed. requestId can be supplied by application wiring; root v1 leaves it absent, so no mandatory Observability context or trace/span IDs. Organizations is intentionally deferred: that capability must choose tenant scope/policy/index migrations when its domain exists.

## Migration, add-on and removal decisions

Root generated/reviewed `drizzle/0003_audit_log.sql` and snapshot/journal add only audit table/indexes. Production's existing bundled migrator + copied drizzle directory applies it; no startup mutation or new daemon/environment/dependency.

Official TanStack CLI 0.71 add-on ID audit-log requires drizzle only, phase example. Owned schema/API files avoid overwriting shared schema/auth/database connection. Clean assets include a freshly generated initial audit-only migration plus config registering baseline and owned schema. Config and migration history are shared-file caveats: official asset copying cannot merge customized config/journals. Existing consumers must manually register schema and generate a new migration, never overlay an applied journal. No custom merger invented.

Application removal drops calls and append/query runtime but retains schema registrations and committed applied migration/history/table by default. Later data destruction requires a new reviewed migration. Fresh never-deployed consolidation is a separate option only. Authoring pruning is independent and retains stable catalog IDs as deferred. Publication remains deferred until customized installation/migration upgrade/version/licensing policies are ready; clean-scaffold proof is not unattended-install safety.

## Verification evidence

All requested verification commands completed successfully:

- `bun install --frozen-lockfile`: checked 727 installs/880 packages; no lockfile changes.
- `bun run agents:check`, `bun run capabilities:status`, `bun run capabilities:check`: passed; only Audit Log status/enablement changed. Agent hook fixture suite: `bun run agents:test`, **120 passed**, after adding the new evaluation document to its existing disposable-copy file list.
- `bun run add-ons:test audit-log`: official Drizzle-only fresh scaffold; clean PostgreSQL migration/index proof; coupled commit/rollback/safety/keyset smoke; initial build; application removal retaining audit rows/schema/SQL; lean rebuild. Repeated after metadata validation tightening.
- `bun run add-ons:test jobs`, `api-platform`, `observability`: passed without changing their independent source/distributables.
- `bun run add-ons:test object-storage`: passed both real RustFS/Garage contracts, Garage UI auth/Admin API/S3 reads, removal and rebuild after a test-local Compose environment override added `NO_PROXY/no_proxy` for `garage,rustfs,localhost,127.0.0.1`. The first unadjusted run failed the UI S3 list with HTTP 500 under this managed proxy environment. No Storage repository code/assets changed; a temporary Docker invocation wrapper supplied only that network environment override.
- `bun run audit-log:smoke`: passed against migrated local PostgreSQL. Leaves explicit safe fixture audit rows, no purge API.
- `bun run check`: agent/catalog/lint/types, **173 tests passing**, production build. Audit-focused subset: **25 tests**, including actual verified API key mapping, no raw credential/body, clean database, indexes, timestamps/UUID uniqueness, strict metadata, caller/validation/database rollback, filtered tied-time keysets and retention after subject deletion.
- `bun run test:e2e`: **3 passed**. Existing OAuth-provider-not-configured test warning is expected in the credential-free local fixture.
- Root application removal in a disposable copy: removed audit calls/runtime/tests/script, retained schema re-export and all committed migrations, then capability governance/typecheck/production build passed. Independent clean fixture additionally compares retained DB row counts after runtime removal.
- Production image built from the repository Dockerfile with only a temporary BuildKit CA-secret mount on dependency installation for managed proxy trust, preserving non-root Node runtime and the existing artifact path. `BUILDX_CONFIG` used a writable temporary directory; Docker credentials/config remained unchanged. Existing Compose `migrate` and `jobs-migrate` ran successfully with that image; app reached healthy. A real authenticated POST to the production Node `/api/v1/projects` returned 201 and produced one correct machine audit record in PostgreSQL with static safe context; raw credential/body excluded. `/api/health` returned 200.

Local tooling used the provided Bun 1.4.2 and workspace cache because the default home cache is read-only. Initial fresh-scaffold installs failed until `BUN_INSTALL_CACHE_DIR` selected the provided writable cache. These are execution-environment accommodations, not repository requirements or capability dependencies. No parallel branch merged/rebased or consumed; planned capability statuses remain unchanged. External publication was not performed.
