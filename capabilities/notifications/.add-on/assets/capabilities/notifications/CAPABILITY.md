# Notifications capability

Status: done. `defaultInstalled: false`; reference application explicitly enables this independent capability.

## Contract

Notifications has Jobs as its only hard reusable dependency; Email, Realtime, Audit and Observability remain optional. PostgreSQL/Drizzle and human authentication are baseline integrations. Default installed is false; the reference explicitly enables it.

Application-owned `notification` fields: package UUID `id`; stable `recipientId` maximum 128; `type` regex `^[a-z][a-z0-9._-]{0,127}$`; plain-text `title` maximum 200/no controls; plain-text `body` maximum 4,096 UTF-8 bytes/no HTML; JSONB `metadata` default {}; package `createdAt` timestamptz(3); nullable `readAt` timestamptz(3). Creation rejects id/createdAt/readAt overrides. No auth-user FK/history cascade. Indexes: (recipient_id,created_at DESC,id DESC), (recipient_id,read_at,created_at DESC,id DESC), (recipient_id,type,created_at DESC,id DESC).

Metadata root plain object, ≤8,192 encoded UTF-8 bytes; depth≤6 with root=0; ≤50 object keys; ≤100 array items; ≤1,024 total nodes; key≤64/string≤1,024 chars. Reject cycles, sparse/custom arrays, Date/Error/class/functions/symbol/BigInt/undefined, accessors/getters/hidden custom properties, prototype pollution, malformed Unicode/control strings. Case/separator-normalized keys containing password/passwd/pwd/secret/token/authorization/cookie/apikey/credential are rejected; request/session/body/header(s) are also rejected. No arbitrary request/session/body/header copying.

Server-authorized recipient predicate is mandatory in queries and updates. Filters: unreadOnly boolean/type exact; page default25/range1–100; order createdAt DESC,id DESC; canonical base64url cursor `[1,createdAtISO,id]`, no OFFSET. Cursor is not authorization/signature/snapshot. markRead/markUnread include recipient in UPDATE and return existence boolean, idempotently preserving an existing read timestamp; foreign IDs return false without existence disclosure.

Creation accepts DB or caller transaction executor. Atomic helper couples domain write, notification insertion and selected Jobs enqueue in one application transaction through the existing native pg-boss Drizzle adapter. It emits no hint itself: applications publish only after successful commit. `notifications.deliver` payload is ONLY `{notificationId,channel}` with channel email|ntfy; no email/body/title/topic/token/SMTP configuration. Worker reloads current notification and target. Defaults: 5 retries after initial attempt, 30-second initial delay, exponential backoff/jitter, max900s, expiry60s, completed retention86,400s. Handler internal deadline55s leaves cleanup margin within expiry. Transient failures throw safe retryable errors; permanent rejection returns terminal business outcome. Scheduler completion does not imply external-delivery success; no exactly-once guarantee.

Application adapter registry receives row and AbortSignal/current resolution context. Email reference resolves current user email and calls existing one-attempt Email capability; ambiguous Email failures retain Email retryability. No SMTP reimplementation. First-class optional ntfy uses official JSON POST publish API with current application topic resolution, `NTFY_BASE_URL` required lazily/no public default, HTTPS except explicit localhost fixture; `NTFY_TOKEN` optional; integer `NTFY_TIMEOUT_SECONDS` default10/range1–30. Redirects manual; network/timeout/408/425/429/5xx retry, other4xx/redirect permanent; publish response body is cancelled, never consumed/logged. Real disposable pinned official ntfy v2.28.0 fixture uses loopback only.

Optional post-commit Realtime event `notifications.created` contains only `{notificationId}`. Failure cannot roll back persisted row; client refetches authoritative state. Optional Audit may record safe actions without automatically copying content. Optional telemetry: operation, finite channel, outcome, duration, numeric retry count only; no recipient labels/title/body/topic/token/email/metadata. No marketing/SMS/APNs/FCM/Web Push/template CMS/preferences product/workflow engine.

## Installation and runtime

Select through official retained `capabilities/notifications/add-on.json`; compiler uses `bun run add-ons:compile notifications`, lifecycle uses `bun run add-ons:test notifications`. Jobs is resolved through the current catalog custom dependency mechanism. Reviewed shared registry override preserves starter.echo and adds notifications.deliver; reviewed Drizzle config adds notification schema without rewriting applied history. Packaged adapter registry starts empty: in-app records need no Email/Realtime/Audit/ntfy. Run explicit db:migrate and jobs:migrate before producers/worker; never during startup.

Scripts: `notifications:unit`, `notifications:smoke`, `notifications:compat`.

New reviewed notification migration is additive; never rewrite applied migrations. Runtime: existing standalone Jobs worker; optional ntfy HTTP server on use. No optional adapter is contacted during build/start/readiness.

## Removal and upgrade

Stop producers; drain or deliberately cancel outstanding notifications.deliver jobs before removing registry/adapters/runtime. Retain notification schema/table/data and all applied migrations by default; retain Jobs, Email, Realtime and Audit. Never delete remote ntfy accounts/topics. Retained schema imports validation JSON types, so keep validation.ts as well.

Contract version1 changes require reviewing payload privacy, delivery/transaction semantics, wire bounds and retained consumer assets. No remote service migration is automatic.

## Verification and agent guidance

Targeted contract tests, clean install/build/removal, actual Node transports or PostgreSQL/Jobs and ntfy fixtures; generic CI matrix discovers this workspace when marked done. Follow `.agents/skills/notifications-change/SKILL.md` and `capability-change`. Evaluation: `NOTIFICATIONS_MODULE_EVALUATION.md`.
