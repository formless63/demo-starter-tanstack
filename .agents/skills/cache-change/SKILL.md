---
name: cache-change
description: Changing ephemeral Cache / Coordination, Redis-compatible configuration, atomic increments, advisory leases, pub/sub, or Valkey fixtures.
---
# Cache changes

Read `capabilities/cache-coordination/CAPABILITY.md` and `docs/evaluations/CACHE_COORDINATION_MODULE_EVALUATION.md`; use capability-change for packaging and observability-change for application telemetry.

- Cache is ephemeral, never durable storage, a job queue, session database, or correctness authority.
- Never log keys, values, channels, prefixes, URLs, credentials, lease tokens, raw errors/causes, or Lua results/scripts containing data.
- All keys/channels are namespaced; validate logical names, bound values and TTLs before sending. Default writes expire; non-expiring writes must be explicit. Leases always expire.
- No KEYS, FLUSHDB, FLUSHALL, arbitrary EVAL, destructive scans, or broad prefix deletion API.
- Increment and initial expiry are atomic. Advisory leases use cryptographic tokens; release/renew must atomically compare ownership. Never claim fencing or Redlock/quorum guarantees.
- Pub/sub has no persistence, replay, or delivery guarantee across disconnects. Use dedicated connections and bounded messages.
- TLS verification remains enabled, including rediss URLs with provider authentication.
- Keep configuration/connection lazy and lifecycle bounded. Startup/readiness is not coupled by default; check is explicit and read-only.
- Real pinned Valkey tests are required, including concurrent increment, stale holders, TTLs and pub/sub. Do not claim untested providers.
- Optional Realtime/API/Jobs/Observability integrations stay optional; reusable assets import none of them. Jobs remains durable in PostgreSQL.

Run backendless cache units, actual Valkey compatibility, telemetry safety when affected, clean installation/removal, governance and normal repository verification. Keep source/assets/compiled distributable/contracts/evaluation aligned.

- Canonical TTL1–86400/value ceiling1MiB; get returns Buffer, setWithoutExpiry explicit, leases seconds2–300 and stale tokens false. Fixed connect2s/operation5s, no automatic reconnect/resubscribe/offline replay. closeCache owns only singleton; manual instances caller-owned. Observer receives only finite operation/success-error/durationSeconds/get hit-miss.
