# Medusa v1 evaluation

Backend pin: Medusa 2.21.2. Bounded native fetch was selected over @medusajs/js-sdk 2.21.2: four GET paths need neither its Store/cart API nor session authentication. No Medusa backend package enters the starter dependency graph. Basic base64(secret-key + ":") follows the pinned SDK. The bridge uses the existing Standard Webhooks verifier and existing Jobs worker.

Pinned source evidence:
- [2.21.2 release](https://github.com/medusajs/medusa/releases/tag/v2.21.2).
- [Admin key transport](https://github.com/medusajs/medusa/blob/v2.21.2/packages/core/js-sdk/src/client.ts).
- [Product event names](https://github.com/medusajs/medusa/blob/v2.21.2/packages/core/utils/src/product/events.ts).
- [Order placed producer](https://github.com/medusajs/medusa/blob/v2.21.2/packages/core/core-flows/src/cart/workflows/complete-cart.ts): emits `OrderWorkflowEvents.PLACED` with `data: { id: createdOrder.id }`. This is source inspection, not a runtime subscriber proof.

Wire fixtures exercise real loopback HTTP under Bun and Node24, raw exact-decimal parsing, Basic authentication, no redirects/retries, slow headers/body, cancellation, response overflow, protocol signature rotation/tampering/replay, scoped SQL, current authorization, transactional receipt rollback, duplicate hints, explicit page reconciliation and retained tombstones. They are mocked protocol fixtures and do not certify native Medusa compatibility.

Actual disposable Medusa 2.21.2 backend/installed bridge compatibility remains unverified. It is a release blocker. The starter must not claim certification, remotely register callbacks, create keys, accept terms, initiate payments or contact provider services during startup. No sandbox or external provider calls are part of these fixtures.
