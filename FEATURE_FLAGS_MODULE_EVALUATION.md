# Feature Flags decision

Status: **in-progress**. Canonical [contract](capabilities/feature-flags/CAPABILITY.md).

Current acceptance: pending on the integrated tree. This source-only preparation does not execute verification. Historical source-branch pass claims are not current evidence. Governance, retained-package parity, independent lifecycle, backend, browser, production and exact-head hosted CI gates remain required before `done`. Fault-injection fixtures (including interruption, timeout, outage and database-failure probes) remain paused pending separate review and authorization; retaining their source does not waive any requirement.

Source-level governance blocker: the root `scripts/capabilities-check.ts` currently requires every reference-enabled capability to be `done`. This preparation deliberately keeps these three entries `in-progress` and reference-enabled, so the unchanged checker cannot yet accept that catalog state. The gate is preserved; resolving this conflict requires an explicit reviewed decision, not a false completion promotion or a weakened check. No checker was executed during source-only preparation.

Selected a local PostgreSQL boolean provider with explicit code integration. No hosted account/service, Redis, analytics, random request percentage or external policy service is needed. [OpenFeature evaluation API](https://openfeature.dev/docs/reference/concepts/evaluation-api/) is a later adapter option, not a current dependency; provider SDK adoption would require a new Bun/Node consumer fixture. The source branch records a source review at implementation launch on 2026-10-01; this is historical context, not a new source verification.

## Cross-framework v1 contract

Boolean immutable-key definitions and exact user/tenant overrides; revision guarded management; disabled wins, tenant precedes user, then the fixed SHA-256/big-endian cohort algorithm, then default. No anonymous identity is minted. One database statement snapshot per evaluation batch≤50; dependency failure returns false/error. No startup query/seed, global context/cache, retry or mandatory optional edge. Trusted management guard, caller transaction variants, private/no-store fixed client allowlist, retained tables/history and explicit product defaults after removal.

Required golden `beta.dashboard` buckets are tenant-a 4307, tenant-b 7830, user-a 2910 and user-b 6109, including the strict 4307/4308 boundary against real PostgreSQL. UTF-8 JSON encoding and control-escape vectors are retained; controls are rejected for live identities. Independent Bun/Node24 clean install, runtime, retained-data removal/rebuild, root checks, development/production browser coverage, production verification and the full generic hosted capability matrix remain required. No current integrated-tree execution or pass is claimed; fault probes remain paused.
