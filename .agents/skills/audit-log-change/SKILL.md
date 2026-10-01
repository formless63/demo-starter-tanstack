---
name: audit-log-change
description: Changing audit events, metadata safety, queries, transaction coupling, or the Audit Log schema and packaging.
---
# Audit Log change

Read the Audit Log contract and evaluation, capability-change, and database-migration before edits.

- Keep the reusable API append-oriented: insert/query only, no update/delete API by default.
- Couple required audited domain mutations and audit inserts in the same caller-owned Drizzle transaction. Never open an independent transaction or swallow an audit failure.
- Never dump request bodies, headers, sessions, API payloads, job payloads or errors into metadata. Explicitly select small safe JSON context.
- Preserve byte/depth/key/array/node bounds and recursive sensitive-key rejection. Never accept classes or Error objects.
- Use stable IDs and minimize PII; never record raw credentials, keys, bearer/session tokens, passwords or secrets.
- Bound pagination and keep stable newest-first keysets; validate cursors before database access.
- Retention/privacy/backup and data destruction are explicit application/operator responsibilities. Retain schema and applied migrations during code removal; destructive removal requires a new reviewed migration.
- Audit Log is distinct from Observability, analytics, telemetry, UI activity feeds and compliance certification. No database immutability claim without an actual administration/retention design.
- API Platform, Jobs, Organizations and other consumers remain optional. Do not add tenant schema or consumer dependencies speculatively.
- Schema/migration tests against clean real PostgreSQL and transaction commit/rollback/query tests are required. Recompile and verify the clean add-on installation/removal and production migration path after relevant changes.
