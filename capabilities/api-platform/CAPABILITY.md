# API Platform capability

Status: done and optional. The reference application installs it to prove integration; generated consumers opt in. Evaluation: `API_PLATFORM_MODULE_EVALUATION.md`.

## Requirements

**Requires:** No reusable capability. The base starter must provide Better Auth, PostgreSQL/Drizzle with explicit migrations, TanStack Start native server routes, and a Node-compatible server runtime.

The current official TanStack CLI add-on IDs are `better-auth` and `drizzle`. API Platform declares both in `dependsOn`: Better Auth alone generates an in-memory authentication configuration, while the Drizzle add-on supplies the persistence boundary used by the API-key plugin and Projects example. These are baseline integration dependencies, not capability graph edges.

**Integrates with:** Audit Log, Observability, Authorization, and Organizations / Tenancy. Each is optional. API-key permissions cover only credential-scoped machine access and do not replace the future Authorization capability.

Reference native route call sites optionally wrap operations with Observability using static contract operation IDs. Independent API Platform add-on assets do not import telemetry; authentication, permissions, 401/403/429 envelopes and rate counters remain unchanged.

**External:** None beyond baseline PostgreSQL.

**Conflicts:** None declared. TanStack CLI 0.71 does not expose custom conflict metadata, so conflicts remain catalog governance metadata.

## Adds

### Dependencies

- `@better-auth/api-key` 1.7.x for user-owned API-key generation, hashing, verification, expiration, metadata, permissions, state, rate-limit counters, and last-use tracking.
- `zod-openapi` 6.x for OpenAPI 3.1.1 generation from Zod schemas.
- `@scalar/api-reference-react` 0.9.x for the interactive documentation surface.
- `@scalar/openapi-parser` 0.29.x as a development-only document validator.
- Existing baseline Better Auth, Drizzle, PostgreSQL, Zod, React, TanStack Start, and Tabler Icons integrations.

### Environment

- `DATABASE_URL`: PostgreSQL used by Drizzle and Better Auth.
- `BETTER_AUTH_SECRET`: signing secret, at least 32 characters and production-specific.
- `APP_BASE_URL`: public Better Auth/application URL.
- Existing optional GitHub, generic OIDC, and magic-link variables remain unchanged in the reference application.

### Scripts

- `bun run api-platform:smoke`: creates hashed keys, verifies protected route behavior and permissions, creates an owner-scoped project, and validates the generated OpenAPI document against a migrated database.
- Baseline `bun run db:generate` and `bun run db:migrate` own schema generation and application.

### Database/migrations

`drizzle/0001_pretty_kat_farrell.sql` adds Better Auth's `apikey` model, indexes hashed lookup values, and safely converts the older nullable timestamp `user.email_verified` representation to Better Auth 1.7's required boolean representation. The conversion treats any prior non-null verification timestamp as verified. Normal application startup never runs migrations.

`drizzle/0002_even_nighthawk.sql` normalizes persisted API-key rate-limit defaults to the v1 contract: 1,000 requests per 60 seconds. It changes defaults for newly created rows without rewriting existing per-key limits.

Raw API keys are generated and returned once by Better Auth. PostgreSQL stores only the plugin's hash plus safe prefix/start characters and lifecycle metadata. `reference_id` is intentionally not a foreign key because Better Auth uses that column for user or future organization ownership according to configuration; this capability configures only user ownership.

### Runtime processes

No additional process. Verification and OpenAPI generation run in the existing TanStack Start server runtime.

### Compose/infrastructure

No new service. The existing PostgreSQL, explicit migration job, production application, and healthcheck path remain sufficient. Container startup does not mutate the API-key schema.

### Add-on packaging

- `capabilities/api-platform/.add-on` is official TanStack custom add-on source.
- `capabilities/api-platform/.cta.json` records the authoring context and official Better Auth/Drizzle selections.
- `capabilities/api-platform/add-on.json` is the retained compiled distributable.
- `capabilities/api-platform/test/clean-install.json` owns clean-scaffold files and verification commands.

The add-on remains `type: "add-on"` and uses the official `example` application phase so its integration assets are written after its Better Auth/Drizzle dependencies. This is necessary because the dependency add-ons own initial auth/schema files and the CLI resolves same-phase dependencies after the requesting custom add-on. API Platform then overlays the clean scaffold with the production-sensible PostgreSQL auth configuration and reviewed schema. Before external publication, the auth-file overlay needs a supported merge/codemod story for already-customized consumer auth configurations; the current official custom add-on format copies assets and does not provide a semantic plugin-list merge.

## Application API

`src/integrations/api-platform` owns:

- `ApiPrincipal`, a plugin-neutral user principal containing `userId`, `keyId`, and typed permissions.
- `requireApiKey(request, permissions)`, which accepts only `X-API-Key`, verifies once through Better Auth, maps missing/invalid/inactive credentials to 401, rate limits to 429, and insufficient permissions to 403.
- A small operation metadata contract and explicit registry. It describes requests, responses, authentication, and required permissions but never dispatches HTTP.
- Shared Zod request/response schemas and the standard `{ error: { code, message, details? } }` envelope.
- Deterministic OpenAPI 3.1.1 generation with unique operation IDs, `ApiKeyAuth`, and `x-required-permissions`.

Native TanStack Start server routes remain the router:

- `GET /api/v1/projects` requires `projects.read` and lists only the key owner's projects.
- `POST /api/v1/projects` requires `projects.write`, validates with the registered Zod body schema, and creates only for the key owner.
- `GET /api/openapi.json` returns only deliberately registered external operations.
- `GET /docs/api` renders Scalar from that document.

`/app/api-keys` is a small authenticated human management example. Its server functions restore a normal Better Auth session before create/list/revoke. API keys cannot create browser sessions because `enableSessionForAPIKeys` is explicitly `false`.

Keys may be named, assigned `projects.read` and/or `projects.write`, optionally expired, listed as safe metadata, and revoked by setting `enabled: false`. Rotation is deliberately non-atomic because the plugin has no first-class atomic rotate operation: create the replacement, present it once, migrate the client, then revoke the old key.

The v1 credential defaults are deliberately explicit and shared across runtime code, persistence defaults, tests, add-on fixtures, and documentation: `X-API-Key`; hashing enabled; browser-session creation disabled; user ownership; no default expiry; 64 generated characters after the `app_` prefix; and 1,000 requests per 60-second window. Callers may request a supported expiry or a reviewed per-key rate override without changing the public authentication scheme.

True standalone service principals are deferred. Better Auth 1.7 cleanly supports user- and organization-owned keys but not a first-class userless service principal appropriate here. The principal union boundary can add organization/service variants later without inventing fake users or another credential store.

## Installation

1. Install `capabilities/api-platform/add-on.json` through normal TanStack custom add-on URL mechanics.
2. Select PostgreSQL when the `drizzle` dependency is resolved; confirm both `better-auth` and `drizzle` appear in `.cta.json`.
3. Review the installed `src/lib/auth.ts` against any consumer-specific providers before accepting the overlay.
4. Configure `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `APP_BASE_URL`.
5. Run `bun run db:migrate`; do not migrate from application startup.
6. Run `bun run api-platform:smoke`, then the normal typecheck/build.
7. Add application-specific external operations by defining a contract and consuming it from a native route file.

## Removal

The verified application-removal recipe is maintained in `docs/STARTING-A-PROJECT.md`. In summary:

1. Revoke or delete active API keys and stop clients using `/api/v1`.
2. Remove the API routes, docs route, management page, server functions, and `src/integrations/api-platform`.
3. Remove only the API-key plugin from the shared Better Auth configuration; preserve GitHub, generic OIDC, magic-link, cookie, and protected-return behavior.
4. Remove API Platform-only packages, tests, CI probes, navigation, and `api-platform:smoke` when unused.
5. Remove `api-platform` from `referenceApplication.enabledCapabilities`. Keep the catalog entry and add-on authoring workspace when the repository should still distribute the capability; pruning reusable source is a separate governance action.
6. Keep the `apikey` table, committed migrations, and boolean `email_verified` model by default. Any data removal requires a separately reviewed migration.

The official CLI has no general uninstall transaction for custom add-ons, so removal remains an explicit reviewed procedure.

## Upgrade considerations

- Keep `better-auth` and `@better-auth/api-key` on compatible versions and regenerate/review schema output before upgrades.
- Preserve hashing, `X-API-Key`, user ownership, and `enableSessionForAPIKeys: false` unless a reviewed security change explicitly says otherwise.
- Recheck plugin error codes, permission/result shapes, expiration behavior, and schema migrations.
- Revalidate OpenAPI with the Scalar parser and inspect Scalar client-only rendering after upgrades.
- Treat permission changes and public response/schema changes as security or versioning changes.
- Recompile and commit `add-on.json` after any source asset or manifest change.

## Verification

Run:

```bash
bun run capabilities:check
bun run capabilities:status
bun run add-ons:test api-platform
bun run db:migrate
bun test src/integrations/api-platform
bun run api-platform:smoke
bun run typecheck
bun run build
```

The clean-install fixture resolves official Better Auth and PostgreSQL Drizzle dependencies, applies migrations to a disposable database, proves hashing and protected route behavior, proves permission denial, validates OpenAPI, and builds the Scalar route. The reference integration suite additionally covers missing/random/disabled/expired/rate-limited keys, cross-user isolation, non-session behavior, standard validation errors, deterministic operation IDs, and exclusion of internal routes.

## Agent guidance

Read `ROADMAP.md`, this file, `.agents/skills/capability-change/SKILL.md`, `.agents/skills/auth-change/SKILL.md`, and `.agents/skills/api-contract-change/SKILL.md` before changing API Platform. Keep native TanStack routes as dispatch, keep schemas shared between runtime and OpenAPI, never log or persist raw keys, preserve human-session-only key management, and update contracts/tests/versioning analysis with every external API change.
