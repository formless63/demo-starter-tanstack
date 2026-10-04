# Organizations native transaction compatibility

Status: **in-progress**. Candidate runtime wiring is prepared; accepted reference enablement remains pending. Clean consumers remain opt-in (`defaultInstalled: false`).

Current acceptance: pending on the integrated tree. This source-only preparation does not execute verification. Historical source-branch pass claims are not current evidence. Governance, retained-package parity, independent lifecycle, backend, browser, production and exact-head hosted CI gates remain required before `done`. Fault-injection fixtures (including interruption, timeout, outage and database-failure probes) remain paused pending separate review and authorization; retaining their source does not waive any requirement.

Acceptance sequencing: the unchanged root `scripts/capabilities-check.ts` requires every accepted reference-enabled capability to be `done`. Prepared candidate runtime wiring remains present, while these three `in-progress` entries are excluded from the accepted reference-enabled list. This follows the existing PWA source-to-acceptance sequence and corrects premature metadata without weakening a gate. Promote status and reference enablement together only after required verification; this source-only correction is not runtime acceptance.

## Selection and launch gate

The baseline pins Better Auth 1.7.7. Organizations uses its official organization plugin, with Drizzle transactions explicitly enabled; no parallel authentication or tenant service is selected. Organizations, Authorization and Feature Flags are in-progress independent opt-in add-ons; reference composition and generic lifecycle/hosted acceptance remain pending on the integrated tree.

## Historical source assessment of the invitation boundary

The source branch records this assessment of the official immutable v1.7.7 source on 2026-10-01; it is retained as contract rationale, not current integrated-tree verification:

- [Invitation acceptance](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/plugins/organization/routes/crud-invites.ts#L742): the conditional pending-to-accepted claim precedes `runWithTransaction` at line 755.
- [Membership/session work and compensation](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/plugins/organization/routes/crud-invites.ts#L830): membership creation and active selection are inside that transaction. On an ordinary caught failure, a separate accepted-to-pending update compensates at lines 845–851.
- [Drizzle adapter transaction option](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/drizzle-adapter/src/drizzle-adapter.ts#L1250): `transaction:true` implements the callback transaction. It does not retroactively include preceding writes.
- [Supported transaction context](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/core/src/context/transaction.ts#L100): nesting honors an already active adapter transaction. An application-owned outer dispatch transaction is a possible approach, but needs verification of every exposed HTTP and server-method path, error-response rollback, session cookies and post-commit hooks. Merely wrapping one application helper does not establish the behavior of unwrapped native methods.

The retained diagnostic `capabilities/organizations/test/native-claim-proof.ts` is designed to invoke actual `auth.api.acceptInvitation` dispatch, the official organization plugin and Drizzle/node-postgres with `transaction:true` against its own pinned PostgreSQL18 container. It targets the accepted-without-membership claim window from a separate connection, then injects a membership-insert failure to test native compensation back to pending. These are intended fixture assertions, not a current execution result. The diagnostic does not copy plugin internals or change root authentication and is separate from required capability acceptance. It remains paused as a fault-injection probe.

Reference commands for later separately reviewed and authorized verification; do not execute during source-only preparation:

```sh
bun capabilities/organizations/test/native-claim-proof.ts
bun build capabilities/organizations/test/native-claim-proof.ts --target=node --outfile=/tmp/organizations-native-claim-proof.mjs
node /tmp/organizations-native-claim-proof.mjs
```

The fixture creates/removes only its uniquely named container. Credentials exist only in this disposable fixture. Its pinned official mirror is PostgreSQL18.1 Alpine digest `sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29`.

## Cross-framework v1 contract — adopted native compatibility revision

The source branch records adoption of the native 1.7.7 acceptance contract on 2026-10-01: a single-winner conditional pending-to-accepted claim followed by transactional membership/session creation where supported, with best-effort restoration to pending on ordinary failure. Claim plus membership is **not crash-atomic**. A process interruption or unavailable compensation can leave accepted status without membership. Only authoritative persisted membership grants tenant access; an invitation status never does.

This issue is distinct from the organization-creation orphan limitation. No outer dispatch transaction framework, copied plugin internals, blind acceptance replay or automatic owner repair is introduced.

The retained independent contract fixture targets native HTTP and auth.api bootstrap, role/owner invariants, verified matching email, concurrent admission, terminal invitations, stale selection after removal, scoped reads and ordinary insertion-failure compensation. The retained interruption scenario uses SIGKILL after the native claim and before membership creation, through both HTTP and auth.api, to require authoritative tenant denial and read-only detection of inconsistent accepted state. This scenario and the other fault probes remain paused; their source is not a completed proof. The full dispatch matrix on actual node-postgres and Bun SQL, independent clean lifecycles, browser/production paths and full hosted CI remain required and pending. See [operational recovery](../../capabilities/organizations/CAPABILITY.md#operator-recovery).

## TanStack CLI dependency overlay order

CLI 0.71 builds package overlays in selected-add-on order. When only a custom URL is selected, recursively appended official prerequisites can replace its exact dependency constraints, even though file overlays honor phase order. Generic catalog-driven serving/scaffolding now selects declared official prerequisites before custom URLs; the CLI still owns resolution/installation. Focused ordering tests and the Organizations clean scaffold must prove the exact Better Auth/core pins; integrated-tree execution remains pending. No capability-specific installer or dependency-manager fork is introduced. Customized shared auth/schema/env files still require a reviewed overlay; this is not a semantic merge.
