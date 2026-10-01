# Authorization v1

Status: in-progress. Opt-in; no other capability is required. See [evaluation](../../AUTHORIZATION_MODULE_EVALUATION.md).

## Contract

`defineAuthorization` eagerly validates code-owned actions (max256) and roles (max64). Actions use the machine grammar and require a dot. Roles explicitly name unique registered actions. No wildcard, global role, policy DSL, remote service, startup query or seed exists. Persisted assignments have UUID IDs, exact user/tenant scope, opaque subject IDs and a unique scope/subject/role tuple. Unknown persisted roles never grant.

`authorize` returns `{allowed,reason,errorCode?}`; `can` returns false on every failure. `requirePermission` throws a closed safe error for denial or unavailable data. Reasons are allowed, unauthenticated, unknown-action, no-grant, scope-mismatch, resource-denied and error. Grants union assigned and application-mapped roles, then intersect mandatory resource predicates and trusted machine credential restrictions. A user scope must equal the actor. Tenant scope requires the injected authoritative membership resolver; absent resolver denies. No scope infers universal access. Browser-provided identities/resources are never trusted context.

`grantRole`, `revokeRole`, `listAssignments` require an injected management guard; absent guard forbids. Grant existing/revoke absent are idempotent. Up to64 assignments per exact subject/scope are serialized with a transaction-scoped advisory lock. Grant checks current target tenant membership. Listing uses25/1–100, newest `(createdAt,id)` keysets, canonical unpadded base64url `[1,UTC millisecond ISO,UUID]`, max2048. The target scope predicate is reapplied every page. Cursors do not authorize.

Convenience operations own one explicit transaction. `*InTransaction` accepts caller ownership and never commits, rolls back, reconnects or retries. Statement timeout5s/lock timeout2s are transaction-local. Evaluations hold the shared subject/scope advisory lock; assignment mutation takes its exclusive counterpart, allowing protected write+decision in the same caller transaction to linearize with revocation. An application membership/resource resolver must lock its facts or use conditional SQL in that same transaction. A prior HTTP check is insufficient. No cache or write replay exists. Optional audit receives the caller transaction and safe action/opaque assignment ID; failure aborts the owner's transaction.

## Application composition

Organizations maps current owner/admin/member to deliberate application roles, independently of native organization administration. Removal invalidates retained tenant assignments on the next resolver lookup. API keys must first pass the existing credential verifier/grants/rate limits, then exact-user policy; neither substitutes for the other. Personal Projects keep owner predicates and own user scope. An organization owner never becomes a personal-project or platform superuser.

## Installation and removal

Use generic `bun run add-ons:compile authorization` and `bun run add-ons:test authorization`. Authoritative `.add-on` source and retained `add-on.json` are an overlay, not a semantic merge for customized auth/schema files. Review shared files before composition. Run explicit committed migrations before operations; no schema work occurs on import/build/start.

Remove application policy imports/adapters and schema export, then this capability's integration source. Restore explicit original owner/resource checks before removing policy calls. Keep assignment tables, SQL, journal hashes/timestamps and migration history. Do not drop data or remove a deployed migration from the release chain. Better Auth and native Organizations administration remain independently valid. Operator cleanup is separate. No new environment settings.

## Verification

Real disposable PostgreSQL18 fixture exercises default denial, union, orphan roles, exact scopes, tenant revocation, credential intersection, concurrent deduplication, rollback, next-request revocation, protected-write locking, timeout and outage. Independent clean installation, Bun/Node24 protocol runtime, retained-data removal and rebuild pass. Root checks and development/production browser coverage pass locally. Exact-head hosted CI remains queued; status is in-progress.
