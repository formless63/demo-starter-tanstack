---
name: search-change
description: Changing Search query safety, PostgreSQL FTS configuration, ranking, cursor semantics, domain authorization, migrations or add-on packaging.
---
# Search change

Read Search CAPABILITY.md and SEARCH_MODULE_EVALUATION.md, capability-change and database-migration before editing.

- Keep PostgreSQL 18 native FTS with explicit simple, weighted A name/title and B description/body, stored generated tsvector and GIN. No triggers where generated storage works; no extensions, separate service or universal search_documents model.
- Validate trimmed query 2–256, default limit25/max100. Bind all user text with websearch_to_tsquery; never interpolate identifiers/filters/SQL or expose raw tsquery syntax.
- Preserve ts_rank_cd normalization32 and descending rank/timestamp/stable-ID tuple ordering. Cursor uses canonical bounded base64url version1; use exact widened float4 JSON number (Math.fround(Number(real rankText))) in both results/cursors and preserve six timestamp digits. Validate canonical UTF-8/JSON/base64url, year0001–9999 calendar/time, opaque unchanged IDs1–128 UTF-16 without Cc/lone surrogates; reject string ranks, negative zero and non-float4 numbers. Never round ranks or truncate timestamp ties. Same query and typed filters across pages.
- Domain code owns authorization/equality predicates; root Projects owner predicate must remain in every page query. Expose only a session-scoped server function, never caller-selected owner/table/columns.
- Return row/stable-ID, numeric rank and nextCursor; never return query/vector internals. Keep explicit Projects projections, including mutations.
- Errors contain only invalid-query/unavailable and fixed messages; discard raw PostgreSQL errors/causes. Raw user search strings never enter logs/spans/metric labels. POST keeps them out of access-log URLs. No required Observability adapter.
- Keep Jobs, Object Storage and Organizations optional, without speculative file extraction, tenant schemas or reindex queues. Do not begin another roadmap capability.
- New schema changes require new explicit reviewed migrations. Removal retains application records, schema vector/index declarations, schema-only helpers and applied SQL/snapshots/journals. Dropping vector/index later is a new reviewed migration.
- Add-on installs no production schema; only the disposable lifecycle fixture owns test SQL. Retain official authoring/distributable/fixture conventions; recompile after asset edits.
- Verify against real PostgreSQL 18: clean and upgrade migration, generated updates/GIN, weights/websearch/bounds, owner isolation, deterministic rank/time/ID cursor traversal, canonical rejection, safe logging/errors, clean install/removal and production migrations. Run repository checks/E2E and catalog-discovered completed lifecycle jobs.
