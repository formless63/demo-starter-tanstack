# Feature Flags v1

Status: done. Independent opt-in PostgreSQL boolean provider. See [evaluation](../../FEATURE_FLAGS_MODULE_EVALUATION.md).

## Contract

`defineFeatureFlags` installs no routes, remote provider, startup fetch/query, seed, environment setting or cross-request cache. Definition keys use ASCII machine grammar max128 and are immutable; description max200 plain characters; enabled/default false, percentage null or integer0–10000, revision initially1. Overrides are exact user/tenant opaque IDs, without Organizations foreign keys. No deletion, JSON values, experiments, segments or email targeting.

`evaluateBooleanDetails`, `evaluateBoolean`, `evaluateMany` (max50 unique validated keys) accept application-created trusted context. Tenant IDs do not authorize. One bounded joined SELECT sees definitions and overrides from one PostgreSQL statement snapshot. Order: unknown false/not-found; disabled false; tenant override; user override; deterministic rollout with tenant preferred over user; otherwise default. Percentage without stable identity uses default, never randomness. Timeout/outage/malformed stored data returns false/error with a closed code, including a whole failed batch. Never fall back to stale true.

Rollout hashes UTF-8 JavaScript compact `JSON.stringify(['feature-flags-v1',key,kind,id])` with SHA-256. First4bytes unsigned big-endian; bucket=floor(uint32*10000/4294967296), true iff bucket<percentage. No salt/normalization/modulo. Details expose value/reason/revision/errorCode, never bucket/target data. A true flag never replaces identity, authorization, predicates, entitlements or validation.

Management create/update/set/remove override and list APIs require an injected trusted management guard; absent forbids. Create existing conflicts. Updates/overrides require expectedRevision under a definition row lock. Semantic mutations increment revision; current-revision no-op does not. No deletion exists; disable is the kill switch. Convenience methods own exactly one transaction; `*InTransaction` never commits/rolls back/reconnects/retries caller ownership. Optional audit shares it. Evaluation statement timeout1s; management5s/lock2s, transaction-local; no write replay. Lists default25/max100 newest createdAt+key (definitions) or createdAt+UUID (overrides), canonical unpadded base64url `[1,UTC millisecond ISO,id]` max2048; key filter is reapplied for override pages.

## Projection and lifecycle

An application authenticated loader/endpoint projects a fixed allowlist≤50, values only, private,no-store. Recompute after identity/tenant change and abort/ignore stale results; do not ship definitions/reasons/DB provider to browsers. Root demo uses only `beta.dashboard` for an innocuous panel. Explicit operator fixture/CLI creates it disabled, never app start.

Use generic compile/test tooling. `.add-on` overlay authoring is authoritative; review shared schema/config in customized consumers. Explicit migrations precede operations. Removal deletes application projection/provider calls, schema composition and integration code; return to explicit product defaults and retain all authorization checks. Preserve tables/override records/applied migration SQL/journal history. Operator data cleanup is separate.

## Verification

Disposable PostgreSQL18 contract proves supplied golden vectors/boundaries, Unicode JSON encoding, unknown/disabled/default, exact precedence, deterministic cohorts, conflicts/no-op, rollback, retained values, timeout/outage and malformed stored data. Local timeout/outage, independent Bun/Node24 clean consumer install/runtime/removal/rebuild, root checks and development/production browser coverage pass. Hosted CI verifies the generic capability matrix.
