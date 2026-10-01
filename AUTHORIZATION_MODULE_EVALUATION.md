# Authorization decision

Status: done. Canonical [contract](capabilities/authorization/CAPABILITY.md). Sources reviewed2026-10-01; no dependency selected beyond existing PostgreSQL/Drizzle.

| Option | Assessment for this bounded v1 |
| --- | --- |
| [CASL](https://github.com/stalniy/casl) | Resource-oriented abilities useful for richer conditions; code-owned explicit action union does not require its rule model. |
| [Casbin](https://casbin.apache.org/docs/overview/) | Model/policy enforcer supports RBAC/ABAC and broader inheritance/patterns; unnecessary policy language and adapter surface here. |
| [OpenFGA](https://openfga.dev/docs/modeling/roles-and-permissions) | Relationship tuples/model suit graphs and recursive relations; v1 has exact scopes and no policy server. |
| [Oso](https://www.osohq.com/docs) | Policy engine/cloud workflow suits richer authorization; no hosted policy provider or DSL is required here. |
| Explicit evaluator | Selected: small fixed registry, persisted assignment union, required application predicates and fail-closed dependencies. |

## Cross-framework v1 contract

Exact user/tenant scope; opaque identity strings; code registry bounds256actions/64roles; assignment UUID/unique tuple; union then resource/credential intersection; denied unknown role/action and unresolved tenant membership; absent management guard forbids. Closed safe results/errors, no context singleton/cache/retries/startup seed, caller-owned transaction variants and retained tables on removal. Optional adapters live in application composition.

The PostgreSQL fixture verifies real assignment concurrency and a shared advisory-lock decision/write versus exclusive revoke. This is a documented primitive lock convention, not a claim that arbitrary application callbacks automatically acquire membership/resource locks. Independent Bun/Node24 clean install, protocol runtime, retained-data removal and rebuild pass. Root checks, development/production browser and production image/migration/worker verification pass locally. Hosted CI verifies the full generic capability matrix.
