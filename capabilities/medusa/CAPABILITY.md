# Medusa v1

Work in progress against frozen main 96976ad323e1bd43a7b7006d5e3294356841c2f4.

Medusa 2.21.2 owns commerce state. This optional capability reads only explicitly bound products and orders through the Admin API, using bounded native fetch and Basic secret-key authentication. Jobs and Webhooks are hard dependencies; Object Storage, Organizations and Search are optional application wiring. Clean consumers keep defaultInstalled:false.

The application-owned subscriber protocol is application-bridge.standard-webhooks-v1, not a native Medusa commerce signature protocol. Bridge installation is a separate operator action. No remote setup, payments, provider credentials, account registration or live provider calls are authorized.

Reserved migration prefixes: 0013/0014. Applied main migrations and data must be preserved. Runtime removal retains bindings, projections, ledger and receipts.

Actual pinned backend/bridge compatibility is unverified and remains a release blocker until demonstrated using a disposable local instance. Mocked wire fixtures alone do not establish native compatibility.
