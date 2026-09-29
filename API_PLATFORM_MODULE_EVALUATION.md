# API Platform module evaluation

## Decision

Implement API Platform as the second reusable capability, optional for generated consumers and installed in the reference application. It uses native TanStack Start server routes, Better Auth's official API Key plugin, Zod contracts, `zod-openapi`, and Scalar. It does not depend on Jobs or introduce another HTTP router.

## Versions evaluated

- Better Auth and `@better-auth/api-key`: 1.7.6.
- `zod-openapi`: 6.0.2 with Zod 4, generating OpenAPI 3.1.1.
- Scalar React reference: `@scalar/api-reference-react` 0.9.75.
- Scalar validation: `@scalar/openapi-parser` 0.29.8, development-only.
- TanStack CLI: pinned 0.71.0.

These were the current stable registry releases during implementation. Better Auth core was aligned from the manifest's older `^1.5.3` declaration to `^1.7.6`; the lockfile had already resolved core 1.7.6. Core and plugin versions remain compatible.

## Why these libraries

Better Auth API Key already owns secure key generation, one-way hashing, prefix/start display data, verification, expiration, enabled state, permission metadata, rate-limit state, and last-use tracking. Reimplementing those would create a second credential system and unnecessary cryptographic responsibility.

`zod-openapi` consumes the starter's Zod 4 schemas without imposing a router and supports OpenAPI 3.1.1. Scalar provides a maintained React client-only reference and a compatible independent validator. Better Auth's OpenAPI plugin was deliberately not used as the application contract source because it describes authentication internals, not the deliberate `/api/v1` surface.

## Credential model

Version 1 supports PAT-style keys owned by real Better Auth users. `ApiPrincipal` isolates routes from plugin result shapes and carries a discriminated `type`, owner ID, key ID, and typed permissions. Organization principals can be added later when the Organizations capability exists.

Better Auth supports user- and organization-owned references but does not supply a clean userless standalone service-principal model for this use case. This implementation does not create fake users or a second credential table. True service principals are deferred.

The plugin is explicitly configured for `X-API-Key`, database storage, hashing enabled, `references: "user"`, and `enableSessionForAPIKeys: false`. A high default of 10,000 requests per 24 hours preserves useful key-level rate limiting without adopting the plugin's surprising 10-per-day default. Invalid, disabled, expired, and deleted keys fail authentication. Route code verifies once, then evaluates permissions from that verified result so insufficient permission can correctly return 403 without double-incrementing rate counters.

## Schema and migration

The official Better Auth generator produced the `apikey` Drizzle model. The committed migration adds that table and three lookup indexes. Its `key` column stores the plugin hash, never the raw secret.

Generator review also found that Better Auth 1.7 expects `user.emailVerified` to be boolean while the starter retained an older nullable timestamp. The migration uses `USING (email_verified IS NOT NULL)`, then sets `DEFAULT false` and `NOT NULL`, preserving the meaning of existing verified rows. The schema export must be named `apikey`; the Better Auth Drizzle adapter discovers plugin models by exported schema key, not only SQL table name.

No startup code mutates schema. Clean installation and production delivery continue through explicit Drizzle migrations.

## Contracts and native routes

The capability's registry stores method, path, stable operation ID, text, tags, request schemas, response schemas, machine-auth flag, and required permissions. `defineApiOperation` is a typed metadata helper, not a router.

Native files under `src/routes` dispatch GET/POST and explicitly consume their contracts and handlers. The Projects schemas validate runtime requests and successful responses, and those same schema objects feed `zod-openapi`. Only the explicit registry is emitted, so health, Better Auth, server functions, and internal application routes cannot leak into the document by filesystem discovery.

The OpenAPI generator sorts operations and statuses, rejects duplicate operation IDs, declares `ApiKeyAuth` with `X-API-Key`, and emits `x-required-permissions`. Scalar fetches `/api/openapi.json` at `/docs/api`.

## Human lifecycle UI

`/app/api-keys` is an authenticated reference page, not an Ops/Admin replacement. It supports names, read/write permission selection, optional 30/90/365-day expiry, one-time secret display, safe metadata listing, and revocation through `enabled: false`. The management server boundary restores a real Better Auth session before invoking the plugin. The raw secret exists only in the create result and transient React state.

The plugin has no first-class atomic rotation API. Rotation is documented honestly as create replacement, present once, migrate the client, then revoke the prior key.

## Application files outside the capability

The reference installation changes:

- `src/lib/auth.ts` to register the API Key plugin.
- `src/db/schema.ts` and committed Drizzle migration/meta files.
- `src/features/projects/projects.server.ts` to expose an owner-explicit insert operation shared by browser and machine interfaces.
- `src/routes/app.tsx` to link the management page.
- `src/routes/api/v1/projects.ts`, `src/routes/api/openapi.json.ts`, `src/routes/docs.api.tsx`, and `src/routes/app.api-keys.tsx`.
- package dependencies/scripts, route-tree output, CI fixture support, and capability documentation.

GitHub OAuth, generic OIDC verification/linking, magic links, cookies, protected-route return behavior, Jobs, and the browser Projects server functions remain intact.

## Add-on dependencies and clean installation

The official CLI reports exact IDs `better-auth` and `drizzle`. A clean scaffold proved the Better Auth add-on does not configure Drizzle transitively, so both are real `dependsOn` entries. The Drizzle fixture selects PostgreSQL. There is no Jobs dependency.

The compiled custom add-on remains an add-on type but uses the official `example` application phase. The CLI writes same-phase dependencies after their requester, so the later supported phase is required for the API Platform auth/schema integration assets to overlay the initial Better Auth/Drizzle files. It installs source, migrations, contracts, native routes, lifecycle UI, skill/docs, and smoke tooling. Generic fixture commands apply migrations and execute the smoke against CI PostgreSQL before the normal build. This proves resolved dependencies, active API-key integration, hashing at rest, verification, permission denial, protected project operations, OpenAPI validation, Scalar compilation, and clean type/build behavior.

The official format copies assets and has no semantic TypeScript merge hook. For clean scaffolds, the retained auth/schema overlay is deterministic. Before external publication, it needs a supported composition or codemod strategy that can preserve arbitrary consumer auth/schema customizations. External publication is intentionally deferred.

## Removal

Removal stops/revokes callers, deletes route/UI/integration files, removes the API Key plugin from shared auth, and removes capability-only packages. The `apikey` table remains by default; dropping credential metadata is a separate destructive migration. The boolean `email_verified` correction remains. The CLI has no automatic uninstall transaction, so CAPABILITY.md lists explicit review steps.

## Optional integration points

Audit Log can record lifecycle/use events; Observability can add safe traces and metrics; Authorization can map credential permissions into richer policy; Organizations can introduce organization-owned principal variants. None is imported or required now.

## Experimental APIs avoided

- No Better Auth API-key session mocking.
- No custom key hashing, Bearer parser, query-string credentials, or separate credential database.
- No Better Auth application-OpenAPI merging.
- No Hono, Express, Fastify, Elysia, GraphQL, SDK generation, MCP, Jobs, Redis, or organization implementation.
- No fake atomic rotation or fake service users.

## Lessons compared with Jobs

Jobs was mostly additive: it could import the baseline Drizzle boundary without modifying it. API Platform extends shared Better Auth and Drizzle schema, so its clean package must prove framework-native dependencies plus overlay behavior and document the current custom add-on format's merge limitation. Database-backed fixture commands are now data-driven and reusable by later add-ons rather than creating an API-specific CI job.

The principal and contract boundaries are intentionally small. That keeps plugin/framework glue local while leaving native routes and application domain behavior visible.
