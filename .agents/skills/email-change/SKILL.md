---
name: email-change
description: Changing SMTP configuration, transactional delivery, magic-link email, message safety, or Mailpit compatibility.
---
# Email changes

Read `capabilities/email/CAPABILITY.md` and `EMAIL_MODULE_EVALUATION.md`; use capability-change for packaging/lifecycle changes and auth-change for magic links.

- Never log recipients, sender addresses, subjects, bodies, Message-ID, magic links/tokens, SMTP credentials/hosts, or raw responses/errors. Serialize only `EmailError.toJSON()`; causes stay server-only.
- Keep explicit TLS mode and certificate validation. Do not infer security from port or expose TLS bypass. Configuration and fixed From/default reply-to remain server-owned and lazy; enabled magic links validate structure before advertising the flow.
- Never automatically retry the primitive send path. Partial acceptance is a result; transport loss after acceptance is ambiguous. Preserve tested 4xx/5xx retryability classification.
- Whitelist structured messages. No file/URL/raw content resolution, arbitrary headers/envelope/DKIM/plugins, attachments, or data-URL conversion. Preserve bounds and control-character rejection.
- Magic links are delivered and awaited, never printed; keep hashed tokens, canonical-origin validation, escaped HTML, and safe browser failures. Use Mailpit to inspect development messages.
- Mailpit stays loopback/local/test-only with temporary storage, bounded messages and no relay. Chaos belongs only in disposable fixtures.
- Jobs and Observability are optional application wiring. No generic queue or message retention is implied. Domain authentication/deliverability and bounce handling remain outside v1.
- Update real SMTP/Mailpit compatibility when transport behavior changes. Run `email:unit`, `email:compat --reference`, `add-ons:test email`, governance and ordinary affected verification; recompile retained assets.
