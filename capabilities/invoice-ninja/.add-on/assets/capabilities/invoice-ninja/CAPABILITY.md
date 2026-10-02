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
authored and compiled removable add-on, generic Bun/Node24 lifecycle and production proof.
Actual pinned disposable-instance unsent/zero-tax/zero-discount/numeric-string proof
is unverified and remains a compatibility blocker. No remote provider calls or callback
registration are authorized. Draft writes must stay disabled until policy proof exists.

Removal must stop processing, retain schemas, migrations and all local history, and
never delete remote resources or deregister callbacks implicitly. No readiness promotion,
merge, deployment or publication is authorized by this branch.
