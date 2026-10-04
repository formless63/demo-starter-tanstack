# Organizations / Tenancy

Status: **done**. Root runtime composition is accepted and reference-enabled; clean consumers remain opt-in (`defaultInstalled: false`).

Acceptance verified on 2026-10-04: merged main `05fcf715483ef30bc56d5c1f40de77fed958baef` passed [all 31 hosted CI jobs](https://github.com/formless63/demo-starter-tanstack/actions/runs/37178672085), including the three identity capability lifecycles and the root application checks. Organizations, Authorization and Feature Flags are done, reference-enabled and opt-in (`defaultInstalled: false`). This records the tested implementation baseline; later changes still require their applicable checks.

This capability is accepted in `referenceApplication.enabledCapabilities`; generated-consumer defaults remain false.

## Cross-framework v1 contract

Official Better Auth 1.7.7 owns organizations, members, invitations and active session selection. Administration and application record authorization are distinct. No automatic signup organization, teams, dynamic roles, ownership transfer, deletion, domain autojoin, arbitrary metadata/logo, billing or provisioning is supported. Creator is the sole immutable owner; roles are exactly owner/admin/member. Owner cannot leave, be removed or demoted. Admin may manage members/member invitations but cannot edit/remove/grant admin or owner. Members read authorized summaries and leave. Native global before hooks and lifecycle hooks both enforce bounds and rank; lifecycle hook target users are never mistaken for actors. Pathless native addMember cannot bootstrap an owner. The named trusted add-member helper restores the authenticated actor and verifies membership/rank explicitly, then preserves native dispatch.

### Native acceptance compatibility

**Adopted platform decision:** acceptance conditionally claims pending→accepted with one winner, then transactionally creates membership/session selection where Better Auth supports it, and best-effort restores pending on ordinary failure. It is **not one crash-atomic transaction**. Unique organization/user membership and a partial unique owner index provide defense in depth; they do not prove at least one owner. An accepted invitation without a membership never grants admission or a usable tenant context. There is no automatic repair, retry, owner assignment or blind resend. Both HTTP and auth.api use upstream dispatch/hooks, without an outer custom transaction framework.

Native creation also lacks an enclosing organization-plus-creator transaction. A failed creator insertion can leave an inaccessible orphan. Never return a successful tenant context for it or assign a later claimant ownership. Inspect actual durable state before any operator action.

## Configuration and boundaries

No new service/provider configuration. Server-only local scalar validation at explicit module construction; no DB query/provisioning/migration on construction, app/worker start or build. `ORGANIZATIONS_CREATION_LIMIT` defaults10/range1–100; `ORGANIZATIONS_MEMBERSHIP_LIMIT` defaults100/range1–1000; `ORGANIZATIONS_INVITATION_LIMIT` defaults100/range1–1000; `ORGANIZATIONS_INVITATION_TTL_SECONDS` defaults172800/range300–604800. Empty/undefined defaults; other malformed integers fail. Native read-then-check admission limits are not serialized quotas.

Names trim1–100 UTF-16 units without C0/DEL; slugs trim/lowercase3–63 ASCII using `[a-z0-9]+(?:-[a-z0-9]+)*`, unique without guessed suffixes. IDs remain opaque nonempty strings≤128 units without controls. Invitation emails trim/lowercase≤254 and valid; member default, admin only by owner. Acceptance requires verified authenticated matching email; expiry is exclusive. Invitations persist without a mandatory delivery transport; application UI must describe created/not-sent and offer authorized copy-link UX. No Email/Jobs/Audit/Notifications/Authorization/Flags import exists in these primitives.

`resolveTenantContext(authenticatedUser,organizationId,dbOrTx)` performs an explicit authoritative membership lookup and returns frozen `{scope:{kind:'tenant',id},userId,membershipId,role}`. Missing/nonmember IDs both return not-found. Active organization is UX state, never authority. Jobs must retain explicit tenant identity and re-resolve membership; no global user/tenant context. Personal Projects remain personal; selecting an organization never moves or shares them. No RLS claim. Domain SQL must include tenant/resource predicates. Use the shared-lock option within the caller transaction for membership-revocation linearization, then perform the protected mutation in that same transaction.

Canonical helper lists default25/max100, newest `(createdAt,id)` first, versioned canonical unpadded base64url `[1,ISO-millisecond-timestamp,id]` keysets≤2048 bytes. Reapply user/organization filters every page. Native endpoints retain their upstream versioned pagination shape; their member-limit options are bounded, not relabeled keysets.

Helpers accept caller DB/transactions and never commit, roll back, reconnect or replay them. `setOrganizationTransactionBounds` applies statement5s/lock2s via actual PostgreSQL SET LOCAL inside a caller-owned transaction. `createBoundedOrganizationAuthDatabase` supplies a dedicated lazy node-postgres native-auth pool with those bounds without modifying the shared application pool. API/db errors use closed static messages and `{code,message,retryable}`; underlying SQL/errors/payloads/invitation links/emails are never logs. The native HTTP error hook prevents Better Call's default raw-error logging. The official adapter is decorated only to normalize thrown driver errors before native auth.api can expose them; transaction/query behavior remains upstream.

## Operator recovery

`diagnoseOrganizationAdmission(dbOrTx,{kind:'operator'},organizationId)` is read-only. The application constructs operator authority outside browser JSON. Its restricted result identifies accepted invitations lacking a matching persisted member, and reports whether exactly one owner exists. Results contain action-capable invitation IDs: restrict access; do not log or export by default. Diagnosis is not recovery or admission.

For accepted-without-membership, first verify the exact organization, invitee's authoritative identity/email, invitation state and all current memberships under appropriate operator locks. Record a safe operator outcome without email/link/payload. Do not reuse an ambiguous acceptance response as success. After confirming absent membership, operator-reviewed targeted SQL may retire that exact inconsistent invitation into a terminal cancelled state, preserving its row/history. Then issue a **new** normal authorized invitation to the verified intended recipient. This is explicit recovery/reinvitation, never automatic acceptance restoration or blind resend. If membership exists, reconcile the user's UI/active selection; do not create a duplicate membership. Never grant owner as recovery.

For creator failure, inspect whether the demonstrably newly created organization has creator membership and any invitations/resources. Do not assign a claimant ownership. Any targeted cleanup requires separate operator review proving it is the new failed record; never broad slug/name cleanup or deletion of an existing organization. Normal runtime does neither repair nor cleanup.

## Persistence and removal

Organization/member/invitation/session data and applied migrations survive removal. Remove native plugin/global hook composition, browser plugin, settings/UI/routes and auth schema runtime registrations as applicable; retain historical schema/migration assets to manage existing data. Remove server-only config options. Keep ordinary auth/session/Projects behavior and explicit owner guards. Authorization and Flags remain independent with optional app adapters removed/replaced. Operator cleanup is separate and destructive; no drop/FLUSH/provisioning occurs during code removal.

## Verification

The retained `bun capabilities/organizations/test/contract.ts` fixture is designed to use a uniquely named disposable pinned PostgreSQL18.1 database for independent native HTTP/auth.api behavior with Drizzle/node-postgres. `native-claim-proof.ts` targets the committed claim before membership and ordinary compensation under Bun and bundled Node24. Required coverage includes both entrypoints, node-postgres and Bun SQL, admission/owner invariants, authoritative denial after interruption, bounded timeout/outage behavior, independent Bun/Node24 clean consumer install/runtime/removal/rebuild, root checks, development/production browser coverage and the full generic hosted capability matrix. Use no customer/production data. The required integrated lifecycle and root checks passed in the linked merged-main CI. See [evaluation](../../docs/evaluations/ORGANIZATIONS_MODULE_EVALUATION.md).
