# Audit Log capability

Status: done; optional (`defaultInstalled: false`). The reference application proves Projects writes. Evaluation: `docs/evaluations/AUDIT_LOG_MODULE_EVALUATION.md`.

## Requirements and boundaries

**Requires:** No reusable capability. Baseline PostgreSQL and configured Drizzle. Authentication is a baseline integration for application actor mapping, not a prerequisite for the primitive. Official TanStack CLI dependency: `dependsOn: ["drizzle"]`; choose PostgreSQL. API Platform, Organizations, Jobs, Invoice Ninja, Stripe and Medusa are optional consumers/integrations. No Webhooks, Observability, Authorization or other capability imports in reusable source. No conflicts declared.

This is an application audit primitive recording who/what acted, namespaced action, generic subject, time, optional outcome/correlation and small safe context. It supplies no application/debug logs, SIEM, analytics, telemetry, feed UI, compliance certification, cryptographic ledger, tenancy or authorization. Keep Pino/OTel separate.

## Adds

One capability-owned schema source: `src/integrations/audit-log/schema.ts`. One `audit_event` table: application-generated cryptographic UUIDv4 primary key; `created_at` timestamptz(3); actor/subject type (64) and nullable stable ID (256); namespaced action (128); optional outcome (64) and request ID (128); JSONB metadata default `{}`. Types/outcomes are extensible strings, not a closed actor enum. No actor/subject foreign keys, tenant/organization, email, API key or job domain columns.

Four B-tree indexes: `(created_at DESC, id DESC)`; `(actor_type, actor_id, created_at DESC, id DESC)`; equivalent subject index; `(action, created_at DESC, id DESC)`. No speculative GIN/full-text/metadata/outcome indexes. Application timestamps are UTC instants with millisecond precision; timestamps are application clock times, not commit order. ID tie-breaking is deterministic, not a same-millisecond causal sequence.

No new dependency in the reference application, environment variable, daemon, queue, container or startup migration. Add-on metadata declares baseline Drizzle, pg and drizzle-kit plus dotenv for the installed config, and the official Drizzle add-on. `DATABASE_URL` is the existing baseline variable. Script: `bun run audit-log:smoke` (requires a migrated non-production test database). Root migration: `drizzle/0003_audit_log.sql` plus snapshot/journal; existing production `migrate` service/image includes it automatically.

## Application API

```ts
import { appendAuditEvent, createAuditActor, createAuditSubject, queryAuditEvents } from '#/integrations/audit-log/audit.server'

await db.transaction(async tx => {
  const project = await tx.insert(projects).values(values).returning()
  await appendAuditEvent(tx, {
    actor: createAuditActor('user', userId),
    action: 'projects.create',
    subject: createAuditSubject('project', project[0].id),
    outcome: 'success',
    metadata: { source: 'application' },
  })
})
const page = await queryAuditEvents(db, { action: 'projects.create', limit: 50 })
const next = page.nextCursor && await queryAuditEvents(db, {
  action: 'projects.create', limit: 50, cursor: page.nextCursor,
})
```

`appendAuditEvent(dbOrTx, event)` uses only the provided insert boundary, never a second connection or transaction. Pass a transaction for required domain/audit coupling and let failures escape its callback. `AuditWriter`/`AuditReader` structurally pick NodePgDatabase insert/select methods, accepting configured databases and NodePgTransaction without `any`/casts or importing the application's DB singleton. Without a caller transaction only the audit insert is atomic. Never catch a validation error and commit the accompanying mutation if auditing is required.

The public reusable API exposes inserts and queries only. This is append-only application behavior, **not database-level immutability**: operators retain normal UPDATE/DELETE/DDL authority. No trigger, retention automation, purge API, signing, tamper evidence, exactly-once guarantee or automatic retry. Successful root mutations record success; failed/denied changes roll back and leave no success record. Recording attempts separately is an application policy.

The primitive generates event UUID/time; callers cannot override or backdate them. Public bounds: actor type32/ID128, action128, subject type64/ID128, outcome32, request ID128. Physical columns retain their compatible historical widths; no applied migration changes.

Identifiers use lowercase bounded `[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*`; actions require a dot. Stable IDs/request IDs are bounded, nonempty, trimmed strings without controls or malformed Unicode. IDs can be absent for system operations. No arbitrary human prose action or database-table vocabulary contract.

## Metadata and privacy

Only a plain JSON object is accepted at the root. Values: null, boolean, finite number, string, array, plain object (including null-prototype inputs). Bounds: 8,192 UTF-8 bytes after JSON encoding, nesting depth 6 (root = 0), 50 keys per object, 100 elements per array, 1,024 total nodes, 64 characters per key, 1,024 characters per string. Strings/keys reject controls and malformed Unicode; strings are individually character-bounded. Cycles, sparse/extended arrays, undefined, BigInt, symbols, functions, accessors, hidden properties, Error/Date/class objects and prototype keys are rejected, never stringified. A validated plain copy prevents getters/custom serialization from being invoked.

Recursive key rejection normalizes case and punctuation, then rejects names containing `password`, `passwd`, `pwd`, `secret`, `token`, `authorization`, `cookie`, `apikey`, or `credential` (including accessToken, refreshToken and clientSecret). Raw container keys request/session/body/header/headers are also rejected after normalization. This rejects rather than silently redacting. It cannot detect a secret or PII hidden under an innocuous key: applications must explicitly choose safe values. No body/header/session/job/API payload copying. No automatic metadata/row logging. AuditLogError carries only a safe code/message; HTTP consumers must keep their safe error envelope and never forward raw SQL errors.

Prefer stable IDs over names/email/address; identifiers may themselves be personal data. Application owners choose lawful capture, access control to query results, retention, privacy/erasure, backup and administrator policies. No automatic PII capture or v1 purge schedule. Organizations scoping is intentionally deferred to that capability's future policy/schema/index migration; Audit Log itself does not enforce tenancy or access rights.

## Query contract

`queryAuditEvents(db, filters)` returns `{ events, nextCursor }`. Limit defaults 50, accepts integers 1–100; one extra row determines the next page. Newest-first `(created_at DESC, id DESC)` keyset with strict tuple `<`, no OFFSET. Versioned canonical base64url JSON `[1, ISO time, UUID]` is opaque to callers, bounded and validated; malformed/noncanonical cursors return INVALID_QUERY before SQL. It is not encrypted, signed, authorization or a frozen snapshot. Keep filters unchanged across pages; concurrent older inserts may appear later, and newly inserted rows above the cursor are omitted until a fresh query.

Filters: actor type/id, subject type/id, action, outcome, inclusive from / exclusive until times, cursor, limit. Reject from >= until; from is inclusive and until exclusive. Unknown predicates rejected. No arbitrary SQL/search/full-text interface. Authorization and tenant scoping are consumer responsibilities; do not expose this query directly as a public route.

## Reference integrations

Projects create/update/delete use the same transaction as the audit insert, enforce existing owner predicates, and use `user + stable user ID`. Context is static source/field names, never field values. Reads are not audited. Root API Platform POST maps its verified `keyId` to `machine`, while project ownership still uses principal.userId; no raw credential or principal/session dump. This wiring belongs to the application; standalone Audit Log requires no API Platform. API Platform's independent distributable is unchanged.

Jobs handlers may pass `createAuditActor('job', stableJobId)` or `system` and their own transaction. Audit Log never enqueues work. Applications may explicitly supply a validated safe requestId from their context; v1 root does not automatically import Observability or capture trace/span IDs.

## Installation and shared files

Official workspace: `.cta.json`, `.add-on/info.json`, `.add-on/package.json`, owned assets, compiled `add-on.json`, and `test/clean-install.json`. Use pinned TanStack CLI 0.71 through normal custom add-on URL installation. Only `drizzle` is resolved; no Better Auth/Jobs/API/telemetry add-on is pulled in.

The clean add-on supplies its own reviewed initial `drizzle/0000_audit_log.sql`, snapshot/journal and a `drizzle.config.ts` overlay that includes both the scaffold's `src/db/schema.ts` and capability-owned schema. It does not overwrite the baseline schema or DB connection. Its phase is `example` so the configuration follows dependency assets. Review config, migrations, existing out directory and db scripts before installation into an existing application: the official format copies files, it cannot semantically merge existing config or migration history. Do not copy the initial journal over deployed migrations. For an existing application, add/re-export the owned schema in the existing configuration, generate/review a **new** migration in that application's history and apply it explicitly. There is no custom merger. Root uses a schema re-export instead of a config overlay.

Clean install: configure DATABASE_URL, `bun run db:migrate`, then `bun run audit-log:smoke` and build. Build/start need no audit connection until used. The clean fixture creates a disposable PostgreSQL database, applies reviewed migrations, checks indexes, runs transaction/query smoke, builds, removes runtime code while retaining history/schema and rebuilds the lean consumer.

## Removal and upgrades

See `docs/STARTING-A-PROJECT.md`. Remove application audit calls/imports, runtime append/query/validation files, tests and smoke script. Keep schema declarations/registration, SQL, snapshots and journals by default, avoiding future db:generate proposing an accidental drop. No automatic uninstall transaction or data deletion. Existing deployed audit data can only be dropped by a new explicit destructive migration after operator retention/privacy review. Never edit/delete applied migrations. A never-deployed fresh project may separately consolidate initial migrations when no database/history needs preserving.

Remove `audit-log` from reference enablement when removing root integration. Authoring source/evaluation/skill pruning is separate: retain stable catalog ID as deferred, remove implementation metadata, update docs. No packages to remove from root: Drizzle/PostgreSQL remain baseline. Schema format/cursor/version/bounds/action changes require compatibility review. Recompile committed distributable after asset changes. External publication is deferred pending semantic shared-config/migration installation support, version/support policy and licensing review; clean-scaffold testing is not a claim of safe unattended install into customized applications.

## Verification and guidance

`bun run add-ons:test audit-log`, `bun test src/integrations/audit-log src/features/projects/audit.integration.test.ts`, `bun run audit-log:smoke`, governance, root check/E2E and production migration/container path. Tests require real non-production PostgreSQL; clean migration suites need CREATE DATABASE on their disposable admin connection, not on production runtime roles. Read `.agents/skills/audit-log-change/SKILL.md` plus capability-change/database-migration for maintenance.
