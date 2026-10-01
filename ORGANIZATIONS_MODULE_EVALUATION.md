# Organizations native transaction compatibility

## Selection and launch gate

The baseline pins Better Auth 1.7.7. Organizations will use its official organization plugin, with Drizzle transactions explicitly enabled; no parallel authentication or tenant service is selected. Organizations, Authorization and Feature Flags remain in progress and are not delivered add-ons yet.

## Verified invitation boundary

Rechecked the official immutable v1.7.7 source on 2026-10-01:

- [Invitation acceptance](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/plugins/organization/routes/crud-invites.ts#L742): the conditional pending-to-accepted claim precedes `runWithTransaction` at line 755.
- [Membership/session work and compensation](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/plugins/organization/routes/crud-invites.ts#L830): membership creation and active selection are inside that transaction. On an ordinary caught failure, a separate accepted-to-pending update compensates at lines 845–851.
- [Drizzle adapter transaction option](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/drizzle-adapter/src/drizzle-adapter.ts#L1250): `transaction:true` implements the callback transaction. It does not retroactively include preceding writes.
- [Supported transaction context](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/core/src/context/transaction.ts#L100): nesting honors an already active adapter transaction. An application-owned outer dispatch transaction is a possible approach, but needs verification of every exposed HTTP and server-method path, error-response rollback, session cookies and post-commit hooks. Merely wrapping one application helper does not establish the behavior of unwrapped native methods.

The retained diagnostic `capabilities/organizations/test/native-claim-proof.ts` invokes the actual `auth.api.acceptInvitation` dispatch, official organization plugin and Drizzle/node-postgres adapter with `transaction:true` against its own pinned PostgreSQL18 container. At entry to the membership transaction a separate connection observes accepted status with zero memberships. A fixture-only database trigger then rejects the insert. The ordinary error returns and the native compensating update restores pending status with zero memberships. It does not copy plugin internals or change root authentication. The diagnostic is separate from the required capability acceptance suite.

Commands:

```sh
bun capabilities/organizations/test/native-claim-proof.ts
bun build capabilities/organizations/test/native-claim-proof.ts --target=node --outfile=/tmp/organizations-native-claim-proof.mjs
node /tmp/organizations-native-claim-proof.mjs
```

The fixture creates/removes only its uniquely named container. Credentials exist only in this disposable fixture. Its pinned official mirror is PostgreSQL18.1 Alpine digest `sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29`.

## Cross-framework v1 contract — adopted native compatibility revision

The orchestrator adopted the native 1.7.7 acceptance contract on 2026-10-01: a single-winner conditional pending-to-accepted claim followed by transactional membership/session creation where supported, with best-effort restoration to pending on ordinary failure. Claim plus membership is **not crash-atomic**. A process interruption or unavailable compensation can leave accepted status without membership. Only authoritative persisted membership grants tenant access; an invitation status never does.

This issue is distinct from the organization-creation orphan limitation. No outer dispatch transaction framework, copied plugin internals, blind acceptance replay or automatic owner repair is introduced.

The independent contract fixture additionally exercises native HTTP and auth.api bootstrap, role/owner invariants, verified matching email, concurrent admission, terminal invitations, stale selection after removal, scoped reads and ordinary insertion-failure compensation. Its current interruption proof deliberately injects the inconsistent durable state; actual process-window interruption and Bun SQL driver verification remain required before completion. See [operational recovery](capabilities/organizations/CAPABILITY.md#operator-recovery).
