# Cache / Coordination capability

Status: done; optional (`defaultInstalled: false`). The reference application enables explicit tooling for continuous verification; normal startup makes no cache connection. Evaluation: `CACHE_COORDINATION_MODULE_EVALUATION.md`.

## Requirements and boundaries

**Requires:** `[]`; no Realtime, Jobs, API Platform, Observability, database, Drizzle or Auth dependency. Baseline Node-compatible server runtime and TanStack Start. Official add-on `dependsOn: []`, conflicts `[]`.

**Integrates with:** Realtime, API Platform and Jobs through optional application composition; Observability through the optional reference wrapper. API Platform may use shared rate-limit state; Jobs may use ephemeral coordination while remaining durable in PostgreSQL; Realtime may later use pub/sub. This capability implements none of those integrations and changes none of their requirements.

**External:** Valkey/Redis-compatible service on first use. Tested target is official Valkey 9.1.2. Common RESP2 command subset only; ordinary Redis-compatible services may support it, but no broad provider/cluster compatibility claim or second Redis implementation test is made.

Ephemeral server primitives only. This is not durable storage, a session database, primary database, queue, rate-limiting product, Realtime capability, distributed workflow engine, Redlock quorum, persistent broker, or search engine. A non-expiring value is still ephemeral.

## Adds

Pinned `redis` / node-redis 6.3.0; no other direct runtime dependency. No migrations, schema, auth, UI, route, readiness change or long-lived worker. Owned files: `src/integrations/cache/`, `scripts/cache-{check,smoke,unit,compat,dev,removal-fixture,removal-data-fixture}.ts`, `compose.cache.yaml`, contract/evaluation/skill. Independent add-on assets contain no application telemetry wrapper or other capability import.

Reference-only `src/lib/cache.server.ts` supplies `getApplicationCache()` / `closeApplicationCache()` and optional `observeCache`; `scripts/cache-telemetry.ts` verifies safe bounded signals. It imports Observability only in application wiring. Removing it leaves the primitive identical.

### Server configuration

Configuration and connection are lazy even for `createCache()`. Build/start and importing or closing an unused instance need no configuration/service. The first operation validates:

| Variable | Default | Limits / semantics |
| --- | --- | --- |
| `CACHE_URL` | Unset | Required on use, `redis://` or `rediss://`, optional provider credentials and numeric database path; no query/hash. Never log or expose to browsers. |
| `CACHE_KEY_PREFIX` | `app:` | 1–64 ASCII characters, starts alphanumeric; remaining alphanumeric, `:._/-`. A trailing `:` is added if absent. Use unique environment/application namespaces. |
| `CACHE_DEFAULT_TTL_SECONDS` | `300` | Integer 1–604800 (7 days); same bound for each call. |
| `CACHE_MAX_VALUE_BYTES` | `1048576` | Integer 1–16777216 (16 MiB ceiling), enforced before sending strings/bytes/messages. |
| `CACHE_CONNECT_TIMEOUT_MS` | `3000` | Integer 100–10000; bounds complete initial connect including retries. |
| `CACHE_COMMAND_TIMEOUT_MS` | `2000` | Integer 100–10000; bounds commands and subscription acknowledgements. |

Two timeout settings are useful for remote service latency; no provider-specific variables. `rediss://` uses Node TLS with explicit `rejectUnauthorized: true`, normal CA verification and hostname checking. No insecure override. Secrets are absent from the frontend env contract and server-only module imports are enforced by Start.

### Key/value model

Logical keys/channels/lease names: 1–256 ASCII characters, starts alphanumeric; remaining alphanumeric, `:._/-`. Empty names, whitespace/controls, wildcard characters and Unicode are rejected. Physical names are prefix + `data:` / `lease:` / `channel:` + logical name. Separation prevents ordinary data deletion overwriting a lease. Prefix and physical names are never telemetry labels.

Values are strings or `Uint8Array`; `get()` returns UTF-8 string or `null`; `getBytes()` returns `Buffer` or `null`. Use bytes for binary round trips. Empty values are valid. No JSON helpers, generic JSON casts, prototype reconstruction or arbitrary command/client access. Reads assume this namespace is exclusively written by bounded writers; this is not a defense against another administrator inserting oversized data directly.

### API

```ts
import { getCache, closeCache } from './src/integrations/cache/cache.server'
const cache = getCache() // still no configuration validation or network
await cache.set('product:summary', 'summary') // default expiry 300 seconds
await cache.set('coordination:flag', 'ready', { ttlSeconds: 60, ifAbsent: true })
const value = await cache.get('product:summary')
await cache.delete('product:summary')
const count = await cache.increment('counter:batch', { by: 1, ttlSeconds: 60 })
const lease = await cache.acquireLease('refresh:summary', { ttlMs: 5000 })
if (lease) {
  try { /* bounded, retry-safe work; it may outlive this lease */ }
  finally { await cache.releaseLease(lease) }
}
const subscription = await cache.subscribe('invalidation', (message) => {
  // message is Buffer; consumer owns parsing, authorization and handler errors
})
await cache.publish('invalidation', 'refresh')
await subscription.unsubscribe()
await closeCache()
```

`createCache({ env?, observe? })` creates isolated instances. `getCache()` is per-process lazy singleton; `closeCache()` resets and closes it. `checkCache()` / instance `checkCache()` is PING only. `set()` returns whether the write succeeded; NX returns false on existing data. `delete()` returns whether a single exact data key existed. `setWithoutExpiry()` is explicitly named; consumers own eventual exact-key cleanup. Omitted TTL never accidentally disables expiry. There is no broad delete/scan/KEYS/FLUSH or general EVAL API.

### Atomic increment

Required `ttlSeconds`, optional integer `by` default 1. A small private Lua script reads/validates integer range, runs INCRBY, then sets EXPIRE only when the counter has no expiry, atomically. Existing expiring counters retain remaining TTL rather than becoming sliding windows. Existing non-expiring integer counters receive the requested TTL. Signed safe JS integers only; overflow/invalid numeric data fails without mutation. Concurrent increments are tested. A timeout/network disconnect can leave the command's outcome unknown; never blindly retry a non-idempotent increment or publish.

### Advisory leases

Acquire: SET namespaced lease key cryptographically random 256-bit token NX PX. TTL integer 100–300000 ms; acquire returns `Lease` or `null`. `renewLease(lease, { ttlMs })` and `releaseLease(lease)` compare the token in atomic private Lua scripts; a stale or wrong holder receives `lease_not_owned` and cannot mutate a replacement. Renew returns updated lease metadata; this is not automatic renewal or a guaranteed local expiry clock. Tokens are sensitive server-only ownership credentials. Do not serialize/log lease objects.

Single-backend advisory leases only: no Redlock/quorum, no fencing token, and process pauses/network partitions can exceed the lease. They are not universally safe distributed locks for irreversible external side effects. Use database uniqueness/transactions or real fencing for critical correctness. Cache eviction/restarts also lose leases. A timeout acquiring a lease may leave a short-lived lease whose token the caller never received; it expires normally.

### Pub/sub

Exact validated channels only; dedicated connection for each subscription, capped at 32, plus one lazy command connection. Subscribers receive bytes; messages above the configured bound from external writers are dropped. `unsubscribe()` is idempotent, stops local delivery immediately, removes its listener and closes its connection. Handler exceptions/rejections are contained without logging message/channel; consumers must handle/report their own failures safely. Handler work is consumer-owned and is not awaited on cache close; bound/manage it explicitly.

No persistence, replay, consumer offsets, acknowledgement or durable event bus. Subscribers can miss messages while disconnected. Supported node-redis reconnect automatically resubscribes active listeners while retries remain. Once reconnect retries are exhausted, create a new subscription explicitly. Publishing's subscriber count does not promise application consumption.

### Lifecycle, reconnect and errors

Supported exponential reconnect: 100 ms up to 1 second, at most six retries; authentication errors stop retries. No offline command queue/replay, queued commands capped at 1024. Complete connect wait is bounded independently of per-attempt timeout. Later operations can reconnect a closed command client. Commands use the supported queue timeout plus an explicit response deadline/connection teardown; subscriptions have explicit acknowledgement timeout/forced close. Timeout outcomes are ambiguous, especially mutations. Core clients install safe error listeners and never log raw errors. Do not attach general command/diagnostics instrumentation that records command arguments.

`close()` rejects new operations, drains already accepted commands for at most 2 seconds, closes each connection with a 2-second bound then destroys if necessary; repeated close is idempotent. Call it on application/worker shutdown; explicitly drain application work first. Reference wrapper registers signal cleanup only when used. Normal root startup/readiness does not instantiate a connection; Cache is not automatically added to `/api/health`.

Safe `CacheError` codes: configuration, connection, timeout, authentication, unavailable, invalid_input, lease_not_owned. Static messages and safe JSON/inspection; original non-enumerable cause is available server-side for deliberate debugging only and must never be serialized/logged. No URL, key, value, channel, script or token appears in public errors.

Optional observer gets only finite operation, success/failure, duration, hit/miss and numeric value size. Observer errors cannot alter core behavior. Reference instrumentation uses bounded `app.cache.*` metrics/spans and static logs; no keys/prefix/channels/URLs/tokens/value/message/user IDs as dimensions. Cache works without Observability installed.

## Local development and verification

```sh
bun run cache:dev:valkey
# Set server-only CACHE_URL=redis://127.0.0.1:6379 separately
bun run cache:check
bun run cache:smoke
bun run cache:dev:down
bun run cache:unit
bun run cache:compat
```

Additive `compose.cache.yaml` pins official `valkey/valkey:9.1.2-alpine` and digest; binds loopback only (`CACHE_DEV_PORT` override). Disposable loopback service needs no auth. AOF and RDB snapshots are disabled; `/data` is tmpfs to override the image's volume declaration; no named/anonymous durable data volume. Normal `compose.yaml` is unchanged. Development down disposes only this ephemeral project.

Check is read-only PING. Smoke uses a unique own prefix, exact-key cleanup and no destructive scans; it never restarts user infrastructure. Compatibility owns an actual disposable Valkey container/project, runs the full same contract including safe restart/recovery, then tears down in finally. No production testing. `CACHE_COMPAT_NODE_SCRIPT` optionally runs a bundled smoke on Node 24 too. `bun run cache:telemetry` verifies reference signal safety without a backend.

Contract coverage: ping, string/byte get/set/delete, default/explicit TTL expiration, NX success/failure, key/value/message/TTL limits, concurrent atomic increments and expiry preservation/attachment, exclusive lease acquisition, token-checked release/renew, expiry/replacement safety, pub/sub delivery/unsubscribe, graceful idempotent close, unavailable classification and actual Valkey restart recovery. Timing uses polling with sensible margins, not millisecond equality. Backendless tests verify lazy installation/build and safe errors; clean fixture verifies independent install, real contract and removal/rebuild.

## Installation, removal and publication

Install retained `capabilities/cache-coordination/add-on.json` by official TanStack CLI URL mechanics in a clean scaffold or existing `.cta.json` app. No official add-on dependency; review existing files with the same paths before asset overlay. Configure only when using Cache; consumer supplies authorization, serialization and shutdown ownership. Recompile via `bun run add-ons:compile cache-coordination`; verify `bun run add-ons:test cache-coordination`.

Application removal: close producers/subscriptions/clients; delete owned integration/scripts/local Compose, root-only wrapper/telemetry tests; remove `redis` if otherwise unused and `cache:*` scripts/env entries/CI step; remove reference enablement and update lockfile. No database/data migration or remote deletion. Reusable authoring source is a separate choice; standard pruning retains the catalog ID as deferred. TanStack CLI has no uninstall transaction. Clean removal fixture deletes runtime/package/env additions without contacting the backend. A disposable Valkey sentinel proves the backend and its existing data survive removal, then the consumer typechecks/builds again.

Upgrade node-redis and Valkey deliberately, rerun real atomic/TLS/lifecycle/subscription tests and backendless builds, retain protocol subset, and recompile assets. Before publication, establish versioned distribution URLs, licensing/release policy and supported runtime/service matrix; validate target authentication/TLS separately. Nothing is published externally by this change.

## Agent guidance

Use `.agents/skills/cache-change/SKILL.md`, capability-change and observability-change when relevant. Preserve ephemeral semantics, bounded inputs, safe errors, namespacing, advisory lease limitations, no replay, TLS verification, optional integrations and startup independence.
