# Cache / Coordination capability

Status: done; optional (`defaultInstalled: false`). The reference application enables explicit tooling for continuous verification; normal startup makes no cache connection. Evaluation: `CACHE_COORDINATION_MODULE_EVALUATION.md`.

## Observable v1 contract

No hard capability dependency. Node production runtime is baseline; Realtime, API Platform, Jobs and Observability are optional integrations. Pins: redis/node-redis 6.3.0 and official Valkey 9.1.2. Cache is server-only and ephemeral; namespacing is not authorization. No durable queue, session store, rate-limit product or distributed-lock correctness guarantee.

Configuration is lazy on first operation: CACHE_URL requires redis:// or rediss:// with optional ACL credentials/numeric DB, no query/hash. CACHE_KEY_PREFIX defaults to app, 1–128 ASCII letters/digits/underscore/hyphen starting alphanumeric. CACHE_DEFAULT_TTL_SECONDS defaults to 300, range 1–86400. CACHE_MAX_VALUE_BYTES defaults to 1048576, range 1–1048576. URLs/credentials never enter errors/logs. Connection is fixed at 2 seconds, command/response at 5 seconds, each shutdown phase at most 5 seconds; queue maximum 1024. No environment timeout tuning. Normal rediss certificate/hostname verification remains enabled; private trust may use NODE_EXTRA_CA_CERTS.

Logical keys/channels/leases are 1–256 ASCII bytes, start alphanumeric, permit letters/digits/: _ . / -, reject empty/traversal segments, controls, whitespace and wildcards. Physical names are `<prefix>:value:<logical>`, `<prefix>:lease:<logical>`, `<prefix>:channel:<logical>`.

`get(key)` returns Buffer or null, preserving arbitrary bytes. Applications explicitly decode/validate text/JSON. `set(key, stringOrUint8Array, { ttlSeconds?, ifAbsent? })` expires by default and returns whether written. `setWithoutExpiry(key, value, { ifAbsent? })` deliberately escapes expiration and returns whether written; it does not imply durability. `delete(key)` deletes exactly one value key and returns boolean, never touching leases. No KEYS/SCAN/FLUSH/prefix delete/arbitrary public EVAL/raw client.

`increment(key, { by?, ttlSeconds? } = {})` uses safe signed JS integers, amount default 1, configured default TTL. Atomic INCRBY + initial expiry attaches TTL to new/persistent integers, preserves existing expiry, rejects invalid/noninteger/overflow before partial mutation. Timeout can mean uncertain mutation; never retry automatically.

`acquireLease(key, ttlSeconds = 30)` allows 2–300 seconds, internally SET NX PX, random 256-bit token, readonly `{ key, token }` or null. `renewLease(lease, ttlSeconds = 30)` and `releaseLease(lease)` return boolean, including false for expired/replaced/wrong token. Advisory only: no heartbeat, fencing, Redlock/quorum or irreversible correctness guarantee.

Exact-channel pub/sub uses Buffer messages bounded by configured maximum (ceiling 1 MiB), dedicated connections, at most 32 active subscriptions per instance. Publish uses an independent command connection. Callback exceptions are isolated; optional onError receives only callback-failed. No persistence/backlog/ack/replay. Automatic reconnect/resubscription is disabled and offline replay is disabled. A later explicit command may create a new connection after terminal failure; failed subscriptions must be deliberately recreated.

`createCache({ env?, observe?, onError? })` is caller-owned and must be closed by that caller. `getCache()` owns only the process singleton; `closeCache()` closes/resets only it. `close()` is idempotent, rejects new operations immediately, stops subscriptions, boundedly drains/closes then destroys unresponsive sockets. Already-running callback work remains application-owned.

Safe codes: configuration, invalid-input, unavailable, timeout, authentication, closed, callback-failed. Static JSON/inspection never exposes raw backend errors, keys/values/channels/tokens/URLs. Optional observer receives only finite operation, success/error, durationSeconds and get hit/miss; exceptions cannot affect behavior. Reference application wrapper owns optional Observability signals.

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
