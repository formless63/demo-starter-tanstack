# Invoice Ninja

Implementation in progress; not enabled in the reference application or clean consumers.
Hard dependencies: Jobs and Webhooks. Optional application wiring: Organizations,
Audit Log and Notifications. Missing provider configuration must remain lazy.

The supported target is Invoice Ninja v5.13.43, commit
382020072bc79e8c7ede49f7e9ce91b0aeb1a051. Source release rechecked:
https://github.com/invoiceninja/invoiceninja/releases/tag/v5.13.43.
Native sender source: https://github.com/invoiceninja/invoiceninja/blob/v5.13.43/app/Jobs/Util/WebhookSingle.php.
Its configured secret header authenticates possession, not a body signature or timestamp.

The boundary primitives validate closed draft inputs and bounded native fetch. No
credentials are selected by browser input. No automatic retries, send, action or payment
endpoints are permitted. Decimal input strings retain exact precision. Raw provider
numeric lexemes must remain exact when projections are implemented.

Required remaining implementation: server-owned scoped bindings, minimal projections,
operation ledger/inbox, atomic existing Jobs handoff, authorization rechecks and fencing,
native routes/server functions, reference UI, migrations 0009/0010 as necessary,
complete add-on runtime assets, generic durable Bun/Node24 lifecycle and production proof.
Actual pinned disposable-instance unsent/zero-tax/zero-discount/numeric-string proof
is unverified and remains a compatibility blocker. No remote provider calls or callback
registration are authorized. Draft writes must stay disabled until policy proof exists.

Removal must stop processing, retain schemas, migrations and all local history, and
never delete remote resources or deregister callbacks implicitly. No readiness promotion,
merge, deployment or publication is authorized by this branch.

The authored/compiled 0.1.0 add-on packages only the boundary foundation. Its generic
fixture runs the same protocol tests under Bun and actual Node24, builds, removes
these files while retaining Jobs/Webhooks, and rebuilds. This does not establish
durable runtime installation/removal or the v1 capability completion gates.

The in-progress root now includes provider-owned bindings, projections, ledger and
inbox schemas, explicit lease/revision worker transitions, transactional handoff
seams, user-scoped native routes and a reference invoices page. These runtime
assets are undergoing fixture and packaging verification; completion is not claimed.
The trusted authorizeReconciliation seam denies absent application wiring and does
not invent an actor from callbacks. User operations retain and recheck their actor.
Only server wiring creates/retire bindings. Draft policy is deny-by-default and
must identify verified company configuration before dispatch.
