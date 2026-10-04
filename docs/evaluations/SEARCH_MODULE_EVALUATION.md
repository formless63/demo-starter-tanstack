# Search module evaluation

Decision: PostgreSQL-native application search, using the existing PostgreSQL 18/Drizzle baseline. Domains retain their authorization/data model. Search installs helpers, not a universal index table or a second service. Root Projects provides the reference; no other repository was consulted.

## Cross-framework v1 contract

- PostgreSQL built-in FTS; explicit `simple` for both vectors and queries, never session defaults.
- Weighted A title/name and B body/description vectors, with coalesce for nulls, stored generated column and GIN index where supported.
- Parameterized `websearch_to_tsquery('simple', query)`; no raw tsquery/filter/SQL API.
- `ts_rank_cd(vector, query, 32)`; normalization 32, no arbitrary rank rounding.
- Trimmed query bounds 2–256; whitespace-only invalid. Page size defaults 25, integers 1–100 (max100).
- Rank DESC, domain updated timestamp DESC, stable ID DESC; deterministic ties.
- Bounded, validated, versioned canonical opaque base64url cursor `[1, rank, updatedAt ISO, id]`. Use an exact widened float4 JSON number and preserve all six timestamp digits. Same query/filters across pages, strict keyset continuation, no OFFSET. Not authorization, signing, encryption or snapshot isolation; concurrent updates can move results.
- Row/stable-ID results with numeric rank and nextCursor or null. No vector/query internals or HTML highlighting.
- No external service, vector/semantic search, embeddings, pg_trgm, OCR, extraction or crawling.
- Application ownership of searchable tables, equality filters, owner/tenant predicates and authorization. No universal `search_documents` model or arbitrary-table public function.
- Safe `invalid-query`/`unavailable` errors; raw queries absent from logs/spans/metric labels by default. No Observability dependency.
- Requires []; integratesWith Jobs, Object Storage, Organizations; baseline PostgreSQL/Drizzle; external PostgreSQL only; defaultInstalled false.

## Official source review (2026-10-01)

[PostgreSQL 18 tables/indexes](https://www.postgresql.org/docs/18/textsearch-tables.html) documents stored generated tsvectors with coalesce and GIN. [Controlling text search](https://www.postgresql.org/docs/18/textsearch-controls.html) documents weights A–D, websearch parsing without raw-tsquery syntax errors, cover-density ranking and rank/(rank+1) normalization 32. Positional lexemes remain unstripped, as cover density requires positions.

[Drizzle generated columns](https://orm.drizzle.team/docs/generated-columns) supports `.generatedAlwaysAs()` on custom types with SQL expressions; [indexes/constraints](https://orm.drizzle.team/docs/indexes-constraints) supports `.using()` and indexed SQL expressions. Installed ORM 0.45.3/Kit 0.31.11 generates root STORED SQL and GIN correctly; no trigger or unsupported ORM extension is needed. A schema-only custom tsvector type avoids representing the generated column as ordinary mutable text.

The installed official TanStack CLI 0.71.0 custom-add-on compiler/installer and its bundled authoring guidance were reviewed. Capability-local `.cta.json`, `.add-on` metadata/assets and compiled JSON follow existing official patterns. Only official Drizzle is a dependency. Add-on production assets deliberately omit schema/config/migration overlays; application domains create new reviewed migrations. The lifecycle fixture's disposable schema is explicitly test-only.

## Exact implementation and framework differences

Root vector: `setweight(to_tsvector('simple', coalesce("name", '')), 'A') || setweight(to_tsvector('simple', coalesce("description", '')), 'B')`, STORED `project.search_vector`; `CREATE INDEX project_search_vector_idx ON project USING gin (search_vector)`. Owner equality and `search_vector @@ websearch_to_tsquery('simple', $query)` compose in the same SQL query. Ranking uses exact `ts_rank_cd(..., ..., 32)`; continuation uses `(rank, updated_at, id) < ($rank::real, $time::timestamptz, $id)`.

Native rank::text is widened with Math.fround(Number(rankText)); results and cursors expose the same exact float4 JSON number. Canonical v1 rejects string ranks and rounded non-float4 numbers, preserves opaque IDs of 1–128 UTF-16 units without Cc/lone surrogates, and validates calendar years 0001–9999 without Date truncation. Both codec directions bound canonical unpadded UTF-8/base64url to 2048 ASCII characters. UTC to_char retains six fractional timestamp digits, preventing JavaScript Date millisecond truncation from skipping equal-rank rows. Query length uses JavaScript UTF-16 code units; malformed Unicode/NUL is rejected safely. IDs/ISO timestamps have explicit cursor bounds documented in CAPABILITY.md.

The framework-specific surface is TanStack Start POST server functions with lazy server imports and an official Drizzle-dependent custom add-on. Domain functions restore baseline Better Auth in the reference. PostgreSQL expressions, bounds, ordering and cursor semantics require no framework-specific deviation. No UI or new HTTP framework is needed.

## Evidence and maintenance

Real PostgreSQL 18 smoke covers A over B, AND/phrase/OR/minus, explicit simple independent of session config, bounds, SQL/tsquery-looking data, generated updates, owner scoping, default/max pages, exact rank/microsecond timestamp/ID cursor traversal, malformed/noncanonical cursors and safe logging/errors. Root tests verify owner isolation including foreign cursors, no internals, GIN/STORED catalog state and safe backend failure. Migration test applies old history with existing records, then new migration, verifies retained hashes, rerun idempotence and clean database migration. Official clean fixture proves installation/build/removal/rebuild and retained application data, generated vector, GIN and migration history after the generic final removal build, before database teardown.

Maintain through search-change/capability-change/database-migration. Preserve applied migration history. A new vector/index removal is a new reviewed migration, not code uninstall. GIN narrows matches but ranking still reads matching vectors; domain owners must review workload/query plans for scale. No latency, snapshot, multilingual stemming or substring-search promise is made. Jobs/Storage/Organizations extensions remain future optional work.
