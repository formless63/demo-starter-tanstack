# Webhooks capability

Status: done; optional (`defaultInstalled: false`). The reference application enables this primitive for explicit continuous verification. Evaluation: `WEBHOOKS_MODULE_EVALUATION.md`.

## Requirements and boundaries

**Requires:** Jobs. The catalog's actual TanStack add-on ID is `postgres-jobs`; `dependsOn: ["postgres-jobs"]` installs that add-on and its configured PostgreSQL Drizzle dependency. Node 24, strict TypeScript and Zod are starter prerequisites. **Integrates with:** Audit Log, Observability and API Platform optionally. **External:** remote webhook endpoints when delivering. **Conflicts:** none.

No independent worker, endpoint database, management UI, API gateway, HTTP client framework, startup migration or other planned capability is included. Domain event schemas, subscription storage, tenant ownership, authorization, target URL/secret ownership and domain processing belong to the application. No endpoint is contacted at normal application/worker startup; health remains database-only.

## Adds and packaging

`src/integrations/webhooks/` owns event definitions/envelopes, protocol, inbound verification/handoff, HTTP delivery and composable Jobs definitions/enqueue. `src/lib/webhooks.server.ts` owns reference registration (`starter.ping`) and a lazy env resolver. The existing Jobs registry spreads `referenceWebhookJobs`; keep all imports server-side. Jobs' generic policy type exposes optional native backoff/max-delay fields.

The add-on adds Zod (already provided by Jobs), `webhooks:unit`, `webhooks:smoke`, fixture/removal scripts, this contract/evaluation and `.agents/skills/webhooks-change/SKILL.md`. Source `.add-on`, `.cta.json`, compiled `add-on.json` and `test/clean-install.json` follow the normal lifecycle. No new migrations or runtime processes. Production bundles smoke into the same application image. Env is optional `WEBHOOK_REFERENCE_URL` and `WEBHOOK_REFERENCE_SECRET`, loaded only for explicit `reference` deliveries; fixture uses generated secrets and a local disposable receiver instead.

## Event and signature contract

`defineWebhookEvents({ "app.event": z.strictObject({...}) })` registers bounded dot-delimited names (1–128 ASCII characters). `createWebhookEvent(registry, type, data)` generates a cryptographic UUID and UTC ISO `createdAt`, validates data, serializes `{ id, type, createdAt, data }` once. Persist/reuse its body string for retries; callers must not regenerate the event per attempt. Default body limit 64 KiB, configurable 1 byte–1 MiB for direct helpers; queued delivery remains capped at 64 KiB.

Implements Standard Webhooks specification 1.0.0 HMAC-SHA256 (`v1`), compatible with the maintained JS reference 1.1.1 for UTF-8 JSON:

- `webhook-id`: stable event ID, also required to match the envelope ID.
- `webhook-timestamp`: current attempt's integer Unix seconds, refreshed at each retry.
- `webhook-signature`: `v1,<base64 HMAC-SHA256>` over ASCII `id.timestamp.` followed by **exact transmitted body bytes**.
- `Content-Type: application/json`; HTTP POST.

Secrets are standard base64 with optional `whsec_` prefix, 24–64 decoded bytes; `generateWebhookSecret()` creates 32 random bytes. Outbound uses the resolver's current primary secret. Inbound accepts up to eight current/previous secrets and space-delimited supported signatures, comparing 32-byte digests using Node `timingSafeEqual`. Ed25519/asymmetric signatures (`v1a`) are outside this v1 capability; unknown versions are ignored. Published reference signing vector is tested.

## Outbound Jobs composition

```ts
const events = defineWebhookEvents({ "app.changed": z.object({ value: z.string() }) });
const jobs = createWebhookJobs({ registry: events, resolveTarget });
// Spread jobs into the application's existing Jobs registry.
const { event, body } = createWebhookEvent(events, "app.changed", { value: "ready" });
await enqueueWebhook({ targetRef: "owned-target", eventId: event.id, eventType: event.type, body });
```

Resolver returns `{ url, signingSecret, policy? }`; throw a safe `WebhookDeliveryError("target", true)` for an explicitly transient resolver failure (unclassified resolver errors are sanitized and permanent). never put URL/secret/authorization into queue payloads. A delivery payload contains only targetRef/eventId/eventType/stable body. Body is intentionally durable in PostgreSQL: apply payload minimization, access control, retention and backups. targetRef/eventId may identify tenants and must not become metric labels. Definitions are application-composable and use existing `startJobsWorker`, validated at enqueue and consumption. `enqueueWebhook` assumes `webhooks.deliver` is registered; use `sendJob` for custom application transactions or `sendJobInTransaction` to atomically couple domain writes and jobs.

Default pg-boss policy: five retries (six total attempts), 30-second initial delay, exponential backoff with pg-boss jitter, maximum delay 900 seconds, active expiry 60 seconds and completed retention one day. Policy is bounded; upgrade existing queue defaults explicitly through normal Jobs operational tooling (`createQueue` does not update existing queues). For typed `sendJob`, queue options accompany each send; specialized `enqueueWebhook` inherits queue defaults. No Retry-After rescheduling is implemented. A permanent failure returns safe `{ outcome: "permanent", category, status? }`, so the job completes with a terminal delivery result rather than triggering pg-boss's indiscriminate throw-based retries. Consumers must inspect outcome rather than equating job completion with delivered success. Retryable failures throw a safe `WebhookDeliveryError` and exhaust to pg-boss failed state.

Native retained job-ID uniqueness scopes enqueue to SHA-256(targetRef, eventId), truncated to a UUID-form 128-bit value. Re-enqueueing the same pair returns `jobId: null` while its row exists. Different targets receive independently. It is **not permanent replay protection**, not remote exactly-once delivery, and does not authenticate targetRef ownership. Removal/retention can reopen an ID; applications needing stronger guarantees own durable idempotency. Never reuse an event ID for changed body bytes. Crash after remote acknowledgement can still redeliver; receivers must be idempotent.

## URL/network and delivery policy

Default HTTPS, no username/password or fragment; rejects localhost/.localhost/.local names and obvious private, loopback, unspecified, link-local, multicast/CGNAT IPv4 and special IPv6 literals (including IPv4-mapped literals). URL parser canonicalization handles alternate IPv4 forms. Explicit `policy.development: true` enables HTTP/private loopback for trusted local fixtures only. `policy.validate(url)` is the application-owned stronger DNS/network boundary; errors are sanitized. These checks **do not prevent DNS rebinding**, resolve DNS, pin addresses or configure network egress. Applications accepting customer URLs must enforce DNS/IP/egress policy before deploying them.

Native fetch uses `redirect: "manual"`; 3xx is permanent failure, never forwarded. Timeout is 10 seconds, configurable 100–30,000 ms, covering fetch/response consumption. Resolver/policy functions are trusted application code and must themselves be bounded; timeout starts after resolution/signing. Response consumption is limited to 16 KiB (configurable 1–64 KiB), discarded/cancelled without exposing/logging contents. A received 2xx acknowledges success even if its optional response body is oversized, stalls, or terminates early; this avoids redelivery after an acknowledgement. No response body is part of the error contract. Other status bodies are discarded and status determines outcome. Network/connection/header timeout, 408/425/429 and 5xx retry; other 4xx and redirects are permanent.

## Inbound and durable application handoff

`verifyWebhookRequest(request, { registry, secrets, ... })` requires POST/identity encoding, rejects excessive or malformed Content-Length, reads **exact raw bytes** with actual-byte bound and default 10-second read deadline (100–30,000 ms), verifies headers/signature/timestamp, then performs fatal UTF-8 decode and JSON/schema parsing. Tolerance is five minutes, configurable 1–900 seconds, symmetric for past and future. No JSON parsing occurs before signature validation. Error categories are static; never return caught errors or raw bodies to callers.

```ts
const event = await verifyWebhookRequest(request, { registry: events, secrets: activeAndPrevious });
await sendJob("app.process-webhook", event); // application's typed schema/handler
return new Response(null, { status: 202 });
```

A valid signature **can be replayed within tolerance**. `handoffWebhookRequest(request, options, enqueue, idempotency)` requires an application-owned `handoffOnce(eventId, enqueue)` boundary. Implement durable ID uniqueness and enqueue in the **same transaction** (e.g. domain-owned received-event storage plus Jobs `sendJobInTransaction`); roll back ID reservation if enqueue fails and return duplicate only after a committed handoff. Namespace IDs per trusted source/tenant when needed. The primitive creates no replay table. The test's Set is a test double, not production replay protection. When the enqueue callback needs a transaction object, verify first, then open an application transaction that reserves the ID and calls sendJobInTransaction with that same tx; do not claim a nontransactional callback supplies atomicity. Domain processing remains a typed application job, never an arbitrary generic handler.

## Optional integrations and safe signals

`onResult` emits bounded registered event type, inbound/outbound operation (currently outbound callback), fixed outcome/category, HTTP code and duration; safe metadata can feed an application audit/telemetry adapter. No mandatory imports from Audit/Observability/API. Callback failures are isolated from acknowledged delivery; application sinks must bound their own work. Instrument verification/processing at application boundaries. Never log secret/signature/payload/response body/full URL/authorization; never use URL, targetRef, event ID or payload fields as metric labels. Retry counts are numeric measurements, not labels. Signed callbacks need no API key by default; optional API contracts may document them with signature authentication.

## Installation, publication and removal

CLI 0.71 replaces remote custom IDs with URLs and cannot directly resolve a retained `postgres-jobs` dependency by ID, even when both raw URLs are supplied. Run `bun scripts/add-ons.ts serve webhooks` in this authoring repository, keep it running, and use its printed `--add-ons` argument with PostgreSQL Drizzle config. `dependsOn: ["postgres-jobs"]` remains the actual declared dependency; catalog-driven generic harness discovers/serves custom dependencies in order, maps only custom dependency IDs to their local transport URLs in served copies, and leaves compilation, asset installation and official dependency resolution to the CLI. Publishing Webhooks JSON alone without making Jobs discoverable is insufficient. Publication needs a compatible CLI/custom registry or a transport manifest referencing immutable dependency URLs. Publish both immutable versioned artifacts with that adapter; direct raw-JSON installation is currently blocked by the upstream identity limitation. External publication is deferred.

The clean add-on owns initial Jobs registry composition, so review/merge `src/integrations/jobs/registry.ts` in an existing customized app rather than overwriting domain jobs. Removal is manual:

1. Stop webhook producers and decide how to drain/archive their queued deliveries. Stop/redeploy worker while removing handlers.
2. Remove Webhooks implementation/tests/scripts, reference event/target resolver, its registry import/spread and any inbound domain Jobs definitions/routes owned by the app.
3. Remove `webhooks:*` scripts, the production smoke bundle, env/Compose target config, and Webhooks-only dependencies if unused (retain baseline Zod and all Jobs packages).
4. Remove `webhooks` reference enablement. Keep Jobs and queue history; never automatically delete queue data or mutate remote endpoints.
5. Run governance/typecheck/build, Jobs smoke, E2E and health. Pruning authoring source is separate: remove workspace/evaluation/skill, retain ID as `deferred`, strip implementation metadata and update docs/catalog/roadmap.

`webhooks-removal-fixture.ts` only runs in its harness-owned disposable clean scaffold, removes this integration, retains Jobs, and rebuilds/runs Jobs smoke. No uninstall transaction is claimed.

## Verification

```sh
bun run webhooks:unit
bun run jobs:migrate
bun run jobs:doctor
bun run webhooks:smoke
bun run add-ons:compile webhooks
bun run add-ons:test webhooks
bun run check
bun run test:e2e
```

Smoke owns its local receiver/sender and uses existing Jobs worker; no SaaS endpoint. It verifies real signing/header/body behavior, rotated inbound key, invalid authentication/timestamps/tampering/envelopes/types/bounds, success, network/header timeout, permanent 400, retryable 408/425/429/500, redirect refusal, response bounds and safe logs. Actual Jobs tests shorten policy explicitly: eventual success after two failures, final failure after three total attempts, permanent failure once, stable body/ID and retained-ID dedupe. Cleanup deletes only test-owned job IDs, restores queue defaults, drains worker and closes receiver. Run on a disposable migrated test database with no other workers.

Release verification passed: frozen install, agent/catalog checks, all five clean add-on suites (including Webhooks removal retaining Jobs), 149 repository tests, production build, all three E2E checks, production-image Node 24 HTTP/Jobs smoke and endpoint-free app/worker startup with healthy database readiness. See evaluation for managed-environment test adaptations.
