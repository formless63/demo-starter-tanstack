---
name: notifications-change
description: Maintaining reusable Notifications transport/data/delivery contracts and lifecycle boundaries.
---
# Notifications changes

Read `capabilities/notifications/CAPABILITY.md`, `docs/evaluations/NOTIFICATIONS_MODULE_EVALUATION.md`, and capability-change before editing packaging/dependencies.

Jobs is the only hard reusable dependency. Recipient predicates belong in every read/update; own IDs/timestamps and bound plain-text/metadata. Couple row/domain/job writes atomically; hints occur only after commit, ID only, best effort. Queue only notificationId/channel; resolve current targets at execution. Preserve safe transient/permanent and one-attempt Email semantics; never log content/recipient/topic/token. Explicit migrations only; removal drains/cancels delivery and retains table/history/Jobs/other capabilities. Test real PostgreSQL, Jobs, SMTP adapter when affected and pinned local ntfy.

Synchronize source/assets/docs/metadata, compile `notifications`, run targeted and clean lifecycle tests, repository checks, all completed lifecycles and production migration/app/worker verification.
