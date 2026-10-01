---
name: webhooks-change
description: Changing signed webhook protocol, inbound verification, targets, delivery or Jobs handoff.
---
# Webhooks changes

Read the Webhooks contract/evaluation and capability-change/jobs-change before editing.

- Verify signatures over exact raw bytes before JSON parsing; preserve Standard Webhooks v1 compatibility and published vector.
- Never log payloads, signatures, secrets, response bodies, authorization headers or complete endpoint URLs.
- Jobs is a hard dependency (`postgres-jobs` add-on). Compose definitions into the existing registry/worker; never add a queue backend or startup migration.
- Audit Log, Observability and API Platform remain optional application integrations. Callbacks use signature authentication, not API keys by default.
- Endpoint secrets/URLs stay in an application-owned target resolver, never job payloads.
- HTTPS is the default; explicit development policy only in fixtures. SSRF policy is an application boundary; literal checks do not prevent DNS rebinding.
- Never silently follow redirects. Retries stay bounded and classified by status/network/timeout.
- Event bytes and ID stay stable across attempts; attempt timestamp and primary-secret signature refresh.
- Replay protection requires durable application-owned ID uniqueness atomically coupled to handoff. No scheduler duplicate suppression is promised; timestamp tolerance permits replay.
- Keep real HTTP + actual Jobs retry tests green (`webhooks:smoke`), plus protocol tests, clean installation/removal and production startup without a receiver.

- The entire resolver/policy/signing/fetch attempt shares one deadline and cancellation signal. Unexpected resolver exceptions are safe/transient; classified invalid/disabled targets permanent. Never consume response bodies or suppress deliberate enqueues using retained job IDs.
