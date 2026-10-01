---
name: import-export-change
description: Changing durable CSV transfer state, application transaction callbacks, deadlines, artifacts or reconciliation.
---
# Import / Export changes

Read `capabilities/import-export/CAPABILITY.md` and its evaluation, then use capability-change for add-on or relationship changes.

- Keep request identity, exact verified scope and current permission checks on every operation and before worker apply/publication. Browser scope/keys/session snapshots never authorize a transfer.
- Preserve source hash/length, private generated attempt pointers, scoped idempotency and receipt history. Existing migrations are immutable; removal retains schema/data/objects.
- Validate all bounded CSV before mutations. Domain callback plus terminal receipt commit in one locked transaction; no external provider I/O, independent commits or automatic write retries. Snapshot transaction closes before S3 upload.
- The dedicated transfer transaction adapter owns its connection; deadline/claim abort closes that connection's supported I/O. Never end an application shared pool or caller transaction. Preserve PostgreSQL local timeout bounds and Storage body closure.
- Native queue/id lookup under receipt lock is reconciliation authority; elapsed time and claim abort do not establish final failure. Never bypass native pg-boss APIs or create another queue/daemon.
- Keep optional composition application-owned and all public errors/issues static/value-free. Preserve canonical spreadsheet escaping, explicit cleanup dry-run and opt-in dependency closure.

Verify CSV and PostgreSQL deadline fixtures, both real S3 providers, duplicate/cancel/retry/crash/snapshot races, generic clean install/removal, all completed lifecycles and root/browser/production/exact-head CI before done. Preserve coherent labeled checkpoints while expensive gates run; keep this track's PR draft for parent integration coordination.
