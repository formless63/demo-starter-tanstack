# Stripe

Implementation in progress. Stripe is independently optional (`defaultInstalled: false`) and requires Jobs and Webhooks. This capability targets stripe-node 23.0.0 and request API 2026-09-30.endive, hosted Checkout payment mode only. Identity remains optional application wiring.

Stripe owns financial state. Application-owned bindings, approved offers, authorization and fulfillment remain separate. Browser input must never select a provider customer, price, endpoint, credentials, account or context headers. Missing configuration must remain lazy and must not affect base startup.

No remote account registration, sandbox API requests, payment, callback registration or financial certification is authorized or claimed. Local protocol fixtures are the authorized compatibility evidence. SDK pinning does not configure a remote webhook endpoint version.

Migration filenames 0011/0012 are reserved; applied baseline history must remain unchanged. Removal must retain provider tables, history and remote resources after stopping handlers. This checkpoint does not yet provide an installable or complete capability and must not be promoted to done.
