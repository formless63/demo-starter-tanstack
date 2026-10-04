---
name: realtime-change
description: Maintaining reusable Realtime transport/data/delivery contracts and lifecycle boundaries.
---
# Realtime changes

Read `capabilities/realtime/CAPABILITY.md`, `docs/evaluations/REALTIME_MODULE_EVALUATION.md`, and capability-change before editing packaging/dependencies.

Keep human session/channel authorization in the application; no bearer/query/API-key auth. Preserve both transport adapters, 64KiB envelope/256KiB output limits, 20s heartbeat, no SSE id/replay claims and immediate cleanup. WebSocket v1 handles no generic client commands. Cache fanout must be optional/single-path and manually recreated after failures. Never log event data/session/channel identifiers; use only finite safe telemetry. Exercise real Node SSE/WS and root cookie auth after changes.

Synchronize source/assets/docs/metadata, compile `realtime`, run targeted and clean lifecycle tests, repository checks, all completed lifecycles and production migration/app/worker verification.
