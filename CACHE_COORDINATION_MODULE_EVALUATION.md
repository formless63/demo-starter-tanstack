# Cache / Coordination module evaluation

## Canonical v1 decisions

The synchronized limits, binary API, expiry/counter/lease behavior, lifecycle and safe telemetry are defined in `capabilities/cache-coordination/CAPABILITY.md`. Connection is fixed at 2 seconds and operation/response and each shutdown phase at most 5 seconds. Automatic reconnect/resubscribe and offline replay are disabled; subsequent explicit commands may reconnect, subscriptions must be recreated. Caller-owned instances and the singleton have independent ownership. No remote provider or distributed-lock certification is claimed.

## Infrastructure, packaging, composition

Separate additive Compose pins Valkey image/digest, loopback port, no authentication for disposable local service, no AOF/RDB, tmpfs /data overriding image's volume declaration and no named volume. Normal production Compose is unchanged. Real compatibility creates a unique project/free port, uses only unique prefix/exact cleanup, restart/explicit recovery is permitted only for that disposable project, and teardown runs finally. Smoke never restarts a user service. Check only PING.

Official TanStack add-on has no framework dependsOn or reusable requires; assets, manifest, .cta, retained distributable and clean fixture are together under capabilities/cache-coordination. Reference app opt-in is separate from generated defaults (false). No Drizzle/Auth/Jobs dependency, migrations, UI, worker or other capability status change. Clean fixture typechecks and backendless-builds without Cache config/service, runs actual Valkey, removes runtime/package/env additions, and builds again. App removal and pruning authoring source are separate; no uninstall transaction or remote destruction. Future API shared rate-limit state, Jobs ephemeral coordination (durable jobs stay PostgreSQL), and Realtime pub/sub are documented only.

Before external publication: versioned URL/release contract, license and dependency advisories, runtime/service/auth/TLS support matrix and consumer overwrite review. No external publication performed.

## Verification evidence

Completed: frozen install; agents:check; capabilities:status/check; clean add-ons for Cache, Jobs, API Platform, Observability and Object Storage; root check (151 tests, lint/types/build); all three Playwright E2E cases; actual Valkey full contract including concurrent counters, stale-token leases, restart/explicit subscription recreation and a paused-command response deadline. The exact contract also passes in a bundled Node 24 process. Cache's final clean fixture builds backendless, runs actual Valkey, removes Redis/runtime/env additions, typechecks and rebuilds. Optional telemetry export tests prove bounded fields and no supplied secrets; observer rejection does not alter core behavior.

Production build with NODE_ENV=production and CACHE_URL empty starts on Node 24.19.0 with no Valkey service, returns HTTP 200 for homepage and database readiness, and contains no cache configuration in browser assets. Repository check's test-mode build was rebuilt in production mode for this explicit runtime probe; no starter configuration change was needed. All temporary test containers are fixture-owned and cleaned up.

Object Storage's existing Garage UI S3 probe initially returned HTTP 500 because this managed environment injects Docker proxy defaults. Re-running with an isolated Docker client configuration adding internal garage/rustfs/garage-ui hostnames to noProxy passed its full fixture; original Docker configuration and all Storage source/status remained unchanged. This is environment setup, not provider compatibility work in Cache.

No claim of a second Redis provider, production cloud service, cluster/Sentinel or TLS provider certification. TLS uses explicit normal verification; the real Valkey fixture is plain loopback.
