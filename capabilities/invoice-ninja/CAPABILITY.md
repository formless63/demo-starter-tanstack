# Invoice Ninja v1

Status: in progress pending complete lifecycle, browser, native-provider and exact-head CI acceptance. The root contains reference wiring for verification; completed catalog enablement is withheld until acceptance. Clean consumers remain opt-in. Hard dependencies are Jobs and Webhooks. Organizations, Audit Log and Notifications remain optional application composition. See [evaluation](../../INVOICE_NINJA_MODULE_EVALUATION.md).

## Boundary

Pin Invoice Ninja 5.13.43, commit 382020072bc79e8c7ede49f7e9ce91b0aeb1a051. Bounded native fetch supports client/invoice GET and narrowly approved unsent draft POST only. No send, payment, credit, recurring invoice, tax, discount, arbitrary property bag or client creation. Company hooks/settings can create side effects: `resolveDraftPolicy` must identify a deployment-verified unsent, zero-tax/discount policy with numeric-string compatibility. Root draft policy is absent and therefore denies. Local fixture compatibility does not certify another deployment.

`INVOICE_NINJA_BASE_URL` and `INVOICE_NINJA_API_TOKEN` are lazy server-only settings shared by app/worker; absent settings never prevent build/start/health. HTTPS except original literal loopback in development/test. No redirects or transport retries. Outbound request256KiB, response2MiB, webhook1MiB, public256KiB, outbound15s, worker45s, receipt5s. Cancellation applies through body streaming. Short owned SQL transactions have transaction/statement/lock deadlines. Caller-owned helpers never settle or retry the caller transaction.

## Authority and state

The application supplies current `authorizeScope`, `authorizeBoundResource`, `authorizeReconciliation`, connection and currency policies. Missing policies deny. User workers recheck the stored actor and current bound-resource policy; callbacks use the explicit current reconciliation policy and never invent a human actor. Bindings are server-owned, scope-filtered, uniquely identify remote resources and are retired rather than remapped. Browser/provider metadata cannot establish ownership.

`requestDraftInvoiceInTransaction`, `requestClientReconciliationInTransaction`, `requestInvoiceReconciliationInTransaction` and `receiptInTransaction` share the caller's database transaction with existing Jobs. Convenience request methods own one transaction. Jobs payloads contain only operationId/inboxId. Normalized immutable draft input and verified policy are private ledger state. Repeated key/same input returns the same operation; changed input conflicts. Frozen policy comparison is independent of JSONB property order.

Dispatch is durably claimed before HTTP. Definitive4xx rejection fails safely; accepted/uncertain writes become reconciliation_required after local failure. No automatic POST replay or fresh idempotency escape is provided. `resolveAmbiguousDraft` is a trusted server-only operator extension: attach-existing verifies the exact invoice and bound client through GET, while confirm-not-created requires an explicit operator decision and cannot contradict a known remote ID. Already-bound target identities conflict instead of being remapped. Neither path retries POST or has a browser endpoint. Known returned remote IDs remain private recovery evidence. Explicit operator recovery repairs expired read attempts and marks stale writes uncertain; receipt repair is conditional and transactional. Token/revision fences and binding locks prevent late projection commits. Projection and successful operation/inbox completion commit together.

Only minimal invoice identity, number, closed lifecycle status, currency, exact decimal amount/balance, source/sync timestamps and tombstone are public. Native invoices do not contain currency_id: resolve currency from trusted bound client/company information or expose null/unsupported; never infer it from amount. Native unsent drafts have amount but zero outstanding balance until the separate mark-sent transition. Preserve numeric JSON lexemes before parsing; no binary-float monetary conversion. No contact details, raw bodies, metadata or payment URLs are stored/logged.

## Callbacks and reference UI

The native fixed connection/event-kind route uses a dedicated `X-Invoice-Ninja-Webhook-Secret` outgoing header, optional current/previous secrets, and body-SHA256 deduplication. This authenticates possession, not a body signature or timestamp. Only authenticated minimal hints enter the inbox; authoritative GET determines state. Native callback registration rejects private/loopback destinations and the fixture does not bypass it or claim native registration proof.

The authenticated `/app/invoices` reference uses native TanStack routes and current user-owned bindings. It lists local projections, reads operation state, requests explicit reconciliation and cancels queued work. Draft inputs remain exact strings and require a trusted policy. Repeated active requests are guarded; cancellation/unmount abort local waits without pretending to undo accepted provider work.

## Migrations and removal

Apply additive `0009_invoice_ninja_v1.sql` via normal explicit `db:migrate`, then existing `jobs:migrate`/`jobs:doctor`. Prior applied SQL and journal entries are immutable. Branch-local idx8 metadata is provisional until paired integration; reserved0008 remains unused. No startup migrations.

Stop/drain Invoice workers and settle/recover attempts before unregistering handlers. Remove its routes/page/navigation, reference composition and registry spread; remove provider settings from app/worker environments. Retain application-owned schema/validation/error types, all five tables, bindings/projections/operations/inbox, Jobs and applied migrations. Removing code never deletes remote resources, deregisters callbacks or revokes credentials. Generic clean-consumer removal rebuilds and compares exact retained rows/history; unrelated Jobs/Webhooks remain usable.

## Verification

`invoice-ninja:unit` tests closed input, exact decimals, cursor, wire bounds and header hints. `invoice-ninja:smoke` requires disposable PostgreSQL18 and verifies real Jobs rollback, normalized idempotency, current scope, definitive rejection/uncertainty, recovery fences and retained tombstones. `invoice-ninja:compat` requires Docker and executes a network-isolated pinned official Invoice Ninja image/company with no external API, account registration or payment. `add-ons:test invoice-ninja` owns clean install, actual Node24/Bun tests, native proof, removal and rebuild. Full reference/browser/production CI remains mandatory before completion.
