# Search capability

Status: done; optional (`defaultInstalled: false`). Evaluation: `SEARCH_MODULE_EVALUATION.md`. The root reference integration searches Projects; clean consumers choose their own domain.

## Requirements and boundaries

Requires: no reusable capability. Baseline PostgreSQL 18 and Drizzle. Official TanStack add-on `dependsOn: ["drizzle"]` with PostgreSQL selected. External requirements: PostgreSQL only. Optional integrations: Jobs for future bulk reindex work, Object Storage for future content indexing, Organizations for future tenant predicates. None is installed/imported by Search. No additional environment variable, runtime process, queue, readiness check, package, extension or service in the reference application. DATABASE_URL remains baseline configuration.

Application domains own searchable rows, authorization and typed equality filters. Search owns query validation, explicit PostgreSQL FTS/schema expressions, rank/cursor/page helpers and safe errors. It never owns a universal `search_documents` table or offers a public arbitrary-table/column search endpoint. SQL helpers receive trusted application columns/predicates; client input never chooses SQL, identifiers, expressions or filters. There is no tenancy/RBAC schema. No external indexer, pg_trgm, semantic/vector search, embeddings, OCR, crawling, extraction, snippets or HTML highlighting.

## Query and result contract

`parseSearchInput({ query, limit?, cursor? })` trims outer whitespace, requires a string of 2–256 UTF-16 code units after trim, rejects whitespace-only, malformed Unicode/NUL, unknown input keys and invalid pagination. Limit defaults 25 and accepts integers 1–100. Query punctuation is data, not a raw tsquery API; use parameterized `websearch_to_tsquery('simple', query)`. PostgreSQL websearch interprets quoted phrases, OR and minus exclusions; punctuation-only input may validly return no matches. The configuration is always `simple`, independent of server/session defaults, with no stemming guarantee.

`weightedSearchVector(title, body)` produces `setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(body, '')), 'B')`. Use the schema-only custom `tsvector` type with Drizzle `.generatedAlwaysAs(...)` and `.using('gin', vector)`. PostgreSQL stores the generated vector and maintains its GIN index without triggers. Root migration `drizzle/0004_search.sql` adds only `project.search_vector` and `project_search_vector_idx`.

Ranking is exactly `ts_rank_cd(vector, query, 32)`, ordered rank DESC, domain updated timestamp DESC, stable ID DESC. Preserve the database's rank text via `rank::text`; return numeric rank separately. `searchTimestamp(updatedAt)` preserves all six PostgreSQL fractional second digits in UTC ISO text. `searchAfter` uses strict tuple `<` with the cursor rank cast to `real` and time cast to `timestamptz`. Use identical rank expressions in selection, ordering and continuation, the same ID collation and the same query/filters on subsequent pages. Fetch limit + 1, then `searchPage` returns `{ results: [{ row, rank }], nextCursor: string | null }`, stripping rank text/time helper fields. Never return tsquery/tsvector internals.

Opaque canonical base64url cursor: JSON `[1, rankText, updatedAtISO, id]`. Rank is a string to preserve the PostgreSQL-returned representation instead of display rounding. Time uses six fractional digits; ID is bounded to 256 code units, trimmed, well-formed and control-free. Cursor input is limited to 2,048 characters and rejects padding, alternate JSON/base64 encodings, wrong versions/types, invalid dates/ranks and extra fields. It contains no SQL. It is not encrypted, signed, authorization, or snapshot isolation. Concurrent writes may move rows; unchanged data has deterministic traversal without duplicates/gaps. Domain timestamp/ID values must fit this documented cursor format.

Errors: `SearchError.code` is `invalid-query` or `unavailable`, with only a fixed safe message. Validate before database access. `safeSearch` discards backend errors and causes, without logging them. Authentication still uses the existing application unauthorized boundary. No automatic retries.

## Reference integration

`searchProjectsForOwner(ownerId, request)` is an internal domain function and always applies the owner equality predicate beside the FTS predicate and cursor. `searchProjects(request)` restores the current user using existing Better Auth and derives ownerId from that session. The native TanStack `searchProjects` server function uses POST so search text does not enter URLs/access logs. Only this session-bound function is exposed; caller-supplied ownerId never comes from a public Search request. The primitive is sufficient without a Search UI.

All Projects selections and mutation returns explicitly project domain fields, preventing generated vector disclosure through pre-existing APIs. Search does not bypass authorization, change existing mutations, or register a machine Search API. Application code may compose additional typed equality predicates, using unchanged filters across pages.

Raw user strings never enter logs, spans, metric labels or errors by default. Reusable helpers have no telemetry import. The existing root request middleware records finite operation/outcome metadata without bodies. A future optional telemetry adapter may record operation, outcome, duration and count only; query text must remain absent. Observability is not a dependency.

## Installation and migration review

Workspace contains `.cta.json`, official `.add-on/info.json`, `.add-on/package.json`, assets, retained `add-on.json`, and `test/clean-install.json`. Compile with pinned CLI 0.71.0 using `bun run add-ons:compile search`; install the compiled custom add-on by URL through the official CLI with Drizzle configured for PostgreSQL. Source/distributable are additive helpers, documentation and `search:smoke`; they contain no production schema registration, migration or universal table. Official Drizzle owns the consumer connection/config.

A domain must explicitly define its generated vector/GIN index, generate and review a NEW migration, then run `bun run db:migrate`. Review any shared schema/config/scripts before installing into an existing application. Do not overwrite its schema or migration journal. Build/start does not contact Search; actual operations require a migrated database. The root uses its existing production one-shot migrate container; no startup DDL.

`bun run search:smoke` uses only a disposable temporary fixture table in a transaction on real PostgreSQL 18. The clean-install fixture additionally creates a unique disposable database, applies a fixture-only reviewed migration (not shipped production schema), runs smoke/build, removes runtime Search, rebuilds and proves fixture data and applied migration history remain. Fixture SQL proves helpers only; it is not an application data model. Tests require a non-production admin connection with CREATE DATABASE. No production testing.

## Removal and upgrades

See `docs/STARTING-A-PROJECT.md`. Remove application server function/search calls and runtime helpers/validation/tests/smoke script. Retain `src/integrations/search/schema.ts`, domain generated vector/index declarations, all applied SQL/snapshots/journals, and domain rows by default. Retaining schema prevents future generation from proposing an accidental drop. Removing Search never deletes application records. A future removal of vector/index requires a new explicit reviewed migration; never rewrite/delete applied history. Drizzle/PostgreSQL remain baseline dependencies.

Remove Search from reference enablement when removing integration. Pruning reusable authoring/evaluation/skill is separate; retain stable catalog ID as deferred without implementation metadata. TanStack has no uninstall transaction; removal is a reviewed recipe. External publication is deferred. Cursor/version/config/ranking/precision changes require compatibility review and fresh tests; unsupported old cursors fail safely.

## Verification and agent guidance

Use `.agents/skills/search-change/SKILL.md`, capability-change and database-migration. Run `bun run search:smoke`, targeted Search/Projects tests, `bun run add-ons:test search`, governance/check/E2E, all completed add-on lifecycle jobs and production migration/container verification. Generic catalog discovery includes Search in CI; no handwritten Search CI job. Real PostgreSQL 18 tests cover clean/upgrade migrations, vectors/GIN, weights, query bounds/websearch/injection-looking data, owner isolation, rank and timestamp/ID ties, canonical cursor/page bounds, logging and backend safety, install/removal with retained records/history.
