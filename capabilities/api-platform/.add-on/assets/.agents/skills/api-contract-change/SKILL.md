---
name: api-contract-change
description: Changing public API routes, OpenAPI contracts, machine permissions, API-key lifecycle/security, or API versioning.
---
# API contract change

1. Read `ROADMAP.md`, `capabilities/api-platform/CAPABILITY.md`, and `API_PLATFORM_MODULE_EVALUATION.md` before editing.
2. Keep native TanStack Start server routes as the only HTTP router. Contracts describe metadata and schemas; they do not dispatch requests.
3. Use the same Zod schemas for runtime validation and OpenAPI generation wherever practical. Contract and runtime behavior must not drift.
4. Give every external operation a stable, unique `operationId`. Register only deliberately external routes.
5. Treat machine-permission changes as security changes. Enforce permissions server-side next to the domain operation and preserve owner scoping.
6. Never log or persist raw API keys. Reveal a new secret once, return only safe metadata later, and keep API-key-backed browser sessions disabled.
7. Preserve the v1 machine-credential defaults unless a reviewed contract/security change updates every layer together: `X-API-Key`, hashing, user ownership, no default expiry, 64 generated characters after the `app_` prefix, and 1,000 requests per 60 seconds.
8. Key lifecycle management requires a normal authenticated human session; a machine key alone must not manage keys.
9. Update OpenAPI, security declarations, required-permission extensions, and tests with every public route or schema change.
10. Consider explicit API versioning before making a breaking change under `/api/v1`.
11. Run the focused PostgreSQL integration tests, OpenAPI validation, `api-platform:smoke`, clean add-on installation, and normal repository/release verification.
