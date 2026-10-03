---
name: identity-policy-change
description: Maintaining native Organization invariants, exact-scope policy transactions, or deterministic boolean flag evaluation.
---
# Identity policy maintenance

Read the relevant `capabilities/{organizations,authorization,feature-flags}/CAPABILITY.md` and evaluation. Preserve three independent add-ons; optional adapters belong to application code.

- Better Auth organization hooks must run through supported global dispatch plus lifecycle hooks. Merge existing auth hooks. Target-user hook data is not the actor; pathless owner grants fail closed. Owner leave has its own global guard, deletion is disabled natively, resend and acceptance require their own checks. Preserve the single immutable owner and membership constraints.
- Native acceptance conditionally claims before the membership transaction. Ordinary compensation is best-effort; a process crash can leave accepted/no-membership. Authoritative lookup must deny. Never silently repair/retry/reassign ownership; follow explicit operator diagnostic/recovery. Test actual HTTP/auth.api and both drivers after auth version changes.
- Policy contexts are application-created exact user/tenant scopes, never body/session selection alone. Keep owner/tenant SQL predicates. Decision and protected mutation share caller transaction/appropriate membership/resource locks. Preserve the shared subject/scope advisory decision lock versus exclusive grant/revoke; never commit/retry caller ownership or cache permissions across writes.
- Flags do not authorize. Preserve disabled > tenant override > user override > fixed SHA-256 cohort > default, one snapshot per bounded batch, safe false/error, optimistic revision/no-op behavior and exact golden vectors. Client projection remains authenticated, fixed allowlist, values only, private/no-store; abort/ignore old-identity responses.
- Preserve schema-only declarations and applied SQL/hashes/timestamps/history on runtime removal. Add migrations; never rewrite deployed history. Keep authoritative `.add-on` assets and retained distributables synchronized, run independent generic lifecycles, root/backend/browser and production gates before done.
