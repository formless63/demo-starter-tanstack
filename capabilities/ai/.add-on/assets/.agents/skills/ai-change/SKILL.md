---
name: ai-change
description: Maintaining bounded server-side AI generation, provider privacy, real streaming, cancellation and independent packaging.
---
# AI change

Read capability-change, capabilities/ai/CAPABILITY.md and AI_MODULE_EVALUATION.md before changes. The prompt-derived cross-framework v1 contract is authoritative; do not consult companion repositories.

- Keep the OpenAI-compatible SDK behind provider.server.ts. Do not expose provider objects, tool execution, arbitrary options, prompts or content in error/telemetry metadata.
- Preserve lazy configuration and no import/build/start/health/worker provider network access. Never infer a model or require authentication for local compatible endpoints.
- Preserve 1–100 messages, 64 KiB each/256 KiB total UTF-8, optional temperature 0–2, tokens 1–65536 and the 1 MiB generated/encoded structured bound.
- Timeout is 60 seconds by default, integer 1–300, over the whole request including streamed reads. Compose caller cancellation, abort underlying transport, and abort immediately on iterator return even with pending next. Release timers/listeners on all exits.
- Disable SDK retries/logging explicitly on upgrades. Check SDK-specific environment inheritance. Never introduce hidden retries: applications/Jobs own billing/idempotency decisions.
- Require completion, JSON parse and authoritative application-owned Zod validation for structured success. Never return partial JSON or provider errors.
- Safe errors contain only finite code, defensible retryable and static message; raw SDK causes must not log/serialize automatically. This implementation drops causes entirely.
- Core has no Jobs/Storage/Observability/Audit dependency. Application wrappers emit only operation, bounded provider, outcome, duration, safe numeric usage and finite finish reason; telemetry failure cannot alter model behavior.
- Run ai:unit, ai:compat, ai:reference:smoke, targeted tests, generic clean install/removal and normal repository/container checks. Tests contact only disposable loopback HTTP, never production providers or real credentials.
- Copy maintained reusable runtime/scripts/contract/evaluation/skill into official .add-on/assets, compile via pinned CLI, and verify retained output. Root src/lib/ai.server.ts stays outside independent assets.
- Removal stops call sites, removes adapter/config/secrets/optional wrappers and reference enablement; no database migration or automatic external credential/account revocation. Authoring-source pruning is a separate choice.
