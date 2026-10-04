# Feature Flags decision

Status: **done**. Canonical [contract](../../capabilities/feature-flags/CAPABILITY.md).

Acceptance verified on 2026-10-04: merged main `05fcf715483ef30bc56d5c1f40de77fed958baef` passed [all 31 hosted CI jobs](https://github.com/formless63/demo-starter-tanstack/actions/runs/37178672085), including the three identity capability lifecycles and the root application checks. Organizations, Authorization and Feature Flags are done, reference-enabled and opt-in (`defaultInstalled: false`). This records the tested implementation baseline; later changes still require their applicable checks.

Acceptance metadata: status and reference enablement now reflect the successful merged-main verification above. Generated-consumer defaults remain false; no capability dependency or verification gate is changed.

Selected a local PostgreSQL boolean provider with explicit code integration. No hosted account/service, Redis, analytics, random request percentage or external policy service is needed. [OpenFeature evaluation API](https://openfeature.dev/docs/reference/concepts/evaluation-api/) is a later adapter option, not a current dependency; provider SDK adoption would require a new Bun/Node consumer fixture. The source branch records a source review at implementation launch on 2026-10-01; this is historical context, not a new source verification.

## Cross-framework v1 contract

Boolean immutable-key definitions and exact user/tenant overrides; revision guarded management; disabled wins, tenant precedes user, then the fixed SHA-256/big-endian cohort algorithm, then default. No anonymous identity is minted. One database statement snapshot per evaluation batch≤50; dependency failure returns false/error. No startup query/seed, global context/cache, retry or mandatory optional edge. Trusted management guard, caller transaction variants, private/no-store fixed client allowlist, retained tables/history and explicit product defaults after removal.

Required golden `beta.dashboard` buckets are tenant-a 4307, tenant-b 7830, user-a 2910 and user-b 6109, including the strict 4307/4308 boundary against real PostgreSQL. UTF-8 JSON encoding and control-escape vectors are retained; controls are rejected for live identities. Independent Bun/Node24 clean install, runtime, retained-data removal/rebuild, root checks, development/production browser coverage, production verification and the full generic hosted capability matrix remain required. The merged-main lifecycle and root checks passed; see the acceptance evidence above.
