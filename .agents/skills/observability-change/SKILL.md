---
name: observability-change
description: Changing server logging, metrics, spans, redaction, OTLP configuration, request correlation, or health telemetry.
---
# Observability changes

Read `capabilities/observability/CAPABILITY.md` and `docs/evaluations/OBSERVABILITY_MODULE_EVALUATION.md` before changing signal contracts.

- Never log secrets. Use static messages and small reviewed fields. Request bodies, raw headers, queries, job payloads, and full auth/session objects are omitted by default. Error messages, stacks, and causes are unsafe input; keep capture generic unless an explicit safe serializer is reviewed.
- Extend recursive redaction for application-specific fields through trusted `LOG_REDACT_FIELDS`; verify both ordinary logs and child bindings.
- Keep metric labels bounded: registered operation/queue names, reviewed route templates, HTTP method/status, and fixed outcomes. IDs belong only in carefully selected logs/spans. Never label arbitrary URLs.
- Prefer current OTel semantic conventions. Upgrade the stable SDK and experimental OTLP exporter packages as a compatible release set.
- Preserve useful logs/context without a backend. OTLP exporters require explicit endpoints; traces and metrics can be disabled independently. Do not add collector infrastructure or vendor dependencies implicitly.
- Use supported Start middleware and retain CSRF protection when editing `src/start.ts`. Coverage ends at the Start handler boundary; streaming/browser/infrastructure instrumentation is separate.
- Jobs and API Platform integrations remain optional application wiring. Never import Observability into their reusable assets or add it to their `dependsOn`.
- Preserve bounded flush/shutdown and drain the Jobs worker before telemetry shutdown. Update signal tests, clean-add-on fixtures, packaging, and capability docs when contracts change.

Run `bun run observability:smoke`, affected integration/E2E checks, `bun run add-ons:test observability`, and normal repository verification.
