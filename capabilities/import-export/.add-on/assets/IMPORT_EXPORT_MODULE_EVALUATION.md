# Import / Export evaluation

Status: in progress. Canonical observable contract: [CAPABILITY.md](capabilities/import-export/CAPABILITY.md).

## Cross-framework v1 contract

The dispatch packet dated2026-10-01 governs exact requester/scope, receipt/job transaction, CSV bounds/escaping, current permission, retry/reconciliation and explicit cleanup semantics. This track inspected only TanStack; no sibling repository was consulted. Native Start routes/server functions, existing pg-boss/Storage and application-owned registry preserve boundaries. Storage's optional GET/PUT/HEAD AbortSignal extension uses AWS SDK send and body destruction; no new storage protocol adapter.

## Upstream evidence

Rechecked at launch: [official csv-parse changelog](https://github.com/adaltas/node-csv/blob/master/packages/csv-parse/CHANGELOG.md) identifies7.0.3 on2026-09-25; [official stringify changelog](https://github.com/adaltas/node-csv/blob/master/packages/csv-stringify/CHANGELOG.md) identifies6.9.0. Both exact packages install with Bun1.4.2. [PostgreSQL18 isolation](https://www.postgresql.org/docs/18/transaction-iso.html) and [timeouts](https://www.postgresql.org/docs/18/runtime-config-client.html) underpin the bounded snapshot/application transactions. [pg-boss12.35.0 supported API/types](https://github.com/timgit/pg-boss/blob/12.35.0/src/types.ts) supplies native retry metadata, cancellation, queue/id lookup and transactional Drizzle send. Existing pinned RustFS1.0.0/Garage2.4.1 fixtures are reused; no new provider account/infrastructure mutations on startup.

## Verification evidence

Bun1.4.2 frozen baseline install and targeted TypeScript pass. Seven CSV unit tests pass, including BOM/CRLF/quoted newline/quote, exact headers, fatal UTF8, byte/row/column/field/logical bounds, safe100-issue truncation, split UTF8 and formula vectors. Local HTTP cancellation fixture passes in Bun and Node24.19.0 for preabort/no I/O, GET acquisition/body destruction, PUT and HEAD acquisition.

Actual PostgreSQL18.1 + pg-boss12.35.0 and each real RustFS1.0.0/Garage2.4.1 pass the disposable transfer fixture: scoped/foreign visibility, UTF8/CSV, receipt idempotency conflict/replay, duplicate attempts/one committed apply, validation and SQL rollback, revoked permission before apply, durable cancel, source expiry/hash integrity, successful snapshot CSV/download and no pre-publication URL, artifact expiry, native missing-job reconciliation, scoped cursor, dry-run/explicit selected cleanup with retained receipt history. This fixture invokes worker core directly; it is not yet proof of process hard-crash or full production-worker behavior.

## Remaining completion gate

Generic clean-consumer install/runtime/removal/rebuild, all completed lifecycles, expanded race/deadline/crash/retry/snapshot fixtures, root/browser development+production, production image/explicit migrations/standalone worker/health and exact final-head hosted CI remain required. No done/ready/merge claim is made until those pass. Callback cooperative cancellation and customized consumer overlays must remain explicit limitations; source/package metadata is not runtime evidence.
