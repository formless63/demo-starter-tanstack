# Feature Flags decision

Status: in-progress. Canonical [contract](capabilities/feature-flags/CAPABILITY.md).

Selected a local PostgreSQL boolean provider with explicit code integration. No hosted account/service, Redis, analytics, random request percentage or external policy service is needed. [OpenFeature evaluation API](https://openfeature.dev/docs/reference/concepts/evaluation-api/) is a later adapter option, not a current dependency; provider SDK adoption would require a new Bun/Node consumer fixture. Sources rechecked at implementation launch2026-10-01.

## Cross-framework v1 contract

Boolean immutable-key definitions and exact user/tenant overrides; revision guarded management; disabled wins, tenant precedes user, then the fixed SHA-256/big-endian cohort algorithm, then default. No anonymous identity is minted. One database statement snapshot per evaluation batch≤50; dependency failure returns false/error. No startup query/seed, global context/cache, retry or mandatory optional edge. Trusted management guard, caller transaction variants, private/no-store fixed client allowlist, retained tables/history and explicit product defaults after removal.

Golden `beta.dashboard` buckets tenant-a4307/tenant-b7830/user-a2910/user-b6109 and the strict4307/4308 boundary pass against real PostgreSQL. UTF-8 JSON encoding and control-escape vectors are included; controls are rejected for live identities. Full lifecycle/browser/production/CI evidence remains pending.
