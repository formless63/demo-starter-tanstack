# Authorization decision

Status: **in-progress**. Canonical [contract](capabilities/authorization/CAPABILITY.md). The source branch records a 2026-10-01 source review; no dependency selected beyond existing PostgreSQL/Drizzle.

Current acceptance: pending on the integrated tree. This source-only preparation does not execute verification. Historical source-branch pass claims are not current evidence. Governance, retained-package parity, independent lifecycle, backend, browser, production and exact-head hosted CI gates remain required before `done`. Fault-injection fixtures (including interruption, timeout, outage and database-failure probes) remain paused pending separate review and authorization; retaining their source does not waive any requirement.

Acceptance sequencing: the unchanged root `scripts/capabilities-check.ts` requires every accepted reference-enabled capability to be `done`. Prepared candidate runtime wiring remains present, while these three `in-progress` entries are excluded from the accepted reference-enabled list. This follows the existing PWA source-to-acceptance sequence and corrects premature metadata without weakening a gate. Promote status and reference enablement together only after required verification; this source-only correction is not runtime acceptance.

| Option | Assessment for this bounded v1 |
| --- | --- |
| [CASL](https://github.com/stalniy/casl) | Resource-oriented abilities useful for richer conditions; code-owned explicit action union does not require its rule model. |
| [Casbin](https://casbin.apache.org/docs/overview/) | Model/policy enforcer supports RBAC/ABAC and broader inheritance/patterns; unnecessary policy language and adapter surface here. |
| [OpenFGA](https://openfga.dev/docs/modeling/roles-and-permissions) | Relationship tuples/model suit graphs and recursive relations; v1 has exact scopes and no policy server. |
| [Oso](https://www.osohq.com/docs) | Policy engine/cloud workflow suits richer authorization; no hosted policy provider or DSL is required here. |
| Explicit evaluator | Selected: small fixed registry, persisted assignment union, required application predicates and fail-closed dependencies. |

## Cross-framework v1 contract

Exact user/tenant scope; opaque identity strings; code registry bounds256actions/64roles; assignment UUID/unique tuple; union then resource/credential intersection; denied unknown role/action and unresolved tenant membership; absent management guard forbids. Closed safe results/errors, no context singleton/cache/retries/startup seed, caller-owned transaction variants and retained tables on removal. Optional adapters live in application composition.

The retained PostgreSQL fixture targets real assignment concurrency and a shared advisory-lock decision/write versus exclusive revoke. This is a documented primitive lock convention, not a claim that arbitrary application callbacks automatically acquire membership/resource locks. Independent Bun/Node24 clean install, protocol runtime, retained-data removal/rebuild, root checks, development/production browser coverage, production image/migration/worker verification and the full generic hosted capability matrix are required acceptance gates. No current integrated-tree execution or pass is claimed; fault probes remain paused.
