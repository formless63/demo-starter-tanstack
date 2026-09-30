# Reusable capabilities

## Capability model

The starter separates its always-present baseline from optional reusable capabilities.

- **Baseline:** framework, TypeScript/Bun/Node tooling, PostgreSQL/Drizzle, passwordless Better Auth, styling/components, containers, testing, and agent scaffolding.
- **Capability:** an independently installable feature contract with implementation assets, dependencies, operational impact, verification, and removal guidance.
- **Reference application:** the root application in this repository. It enables all completed capabilities to keep their integration and deployment paths continuously tested.
- **Generated consumer:** a clean application scaffold. It receives a capability only when the capability is explicitly selected or installed.

The presence of `capabilities/<id>/.add-on` in this repository means the add-on can be authored and tested here. It does not make that capability part of every generated consumer. Likewise, entries in `ROADMAP.md` with planned/deferred status are architecture intent; no implementation exists merely because a row is present.

`defaultInstalled` has one definition: whether a clean base/generated consumer receives the capability without explicitly selecting or installing it. It does not describe the root reference application.

## Completed capabilities

| ID | TanStack add-on ID | Status | Reference app | Default installed | Official add-on dependencies | Reusable capability requirements | External | Contract |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `jobs` | `postgres-jobs` | Done | Enabled | No | `drizzle` | None | PostgreSQL | [Jobs](../capabilities/jobs/CAPABILITY.md) |
| `api-platform` | `api-platform` | Done | Enabled | No | `better-auth`, `drizzle` | None | None beyond baseline PostgreSQL | [API Platform](../capabilities/api-platform/CAPABILITY.md) |
| `observability` | `observability` | Done | Enabled | No | None | None | Optional OTLP | [Observability](../capabilities/observability/CAPABILITY.md) |
| `object-storage` | `object-storage` | Done | Enabled | No | None | None | S3 only when used | [Object Storage](../capabilities/object-storage/CAPABILITY.md) |
| `email` | `email` | Done | Enabled | No | None | None | SMTP only when used; optional Mailpit | [Email](../capabilities/email/CAPABILITY.md) |

Run `bun run capabilities:status` to render these facts from the catalog and current add-on source.

## Installing a capability

The distributable for each completed capability is the committed `capabilities/<id>/add-on.json`. TanStack CLI consumes custom add-ons by URL. Use a URL for the compiled JSON—such as the raw file in this repository or the equivalent URL in your fork—and run the command in a TanStack CLI scaffold that has `.cta.json` metadata.

To create a clean application with Jobs:

```bash
bunx @tanstack/cli@0.71.0 create my-app \
  --framework React \
  --package-manager bun \
  --add-ons https://raw.githubusercontent.com/formless63/demo-starter-tanstack/main/capabilities/jobs/add-on.json \
  --add-on-config '{"drizzle":{"database":"postgresql"}}' \
  --no-git --no-intent --yes
```

To create a clean application with API Platform:

```bash
bunx @tanstack/cli@0.71.0 create my-app \
  --framework React \
  --package-manager bun \
  --add-ons https://raw.githubusercontent.com/formless63/demo-starter-tanstack/main/capabilities/api-platform/add-on.json \
  --add-on-config '{"drizzle":{"database":"postgresql"}}' \
  --no-git --no-intent --yes
```

For an existing TanStack CLI-created application, run from its root:

```bash
bunx @tanstack/cli@0.71.0 add https://raw.githubusercontent.com/formless63/demo-starter-tanstack/main/capabilities/jobs/add-on.json
```

Replace the URL with the API Platform, Observability, Storage or Email distributable to select that capability. Review the resulting diff, configure its environment, apply any declared migrations, and run its `CAPABILITY.md` verification. Observability has no migrations or database dependency. The repository's `bun run add-ons:test <id>` harness serves the same compiled JSON locally and verifies the clean-create flow in a disposable scaffold.

Official TanStack add-on dependencies are resolved by the CLI:

- Jobs declares `dependsOn: ["drizzle"]` because it needs an actual configured Drizzle integration.
- API Platform declares `dependsOn: ["better-auth", "drizzle"]` because Better Auth alone does not provide its PostgreSQL/Drizzle persistence boundary.
- Observability declares `dependsOn: []`; its clean fixture proves signals and real optional OTLP export without Jobs, API Platform, authentication, or a database integration.
- Object Storage declares `dependsOn: []`; its clean fixture rejects database/auth/Jobs/API/telemetry installation, builds backendless, tests real RustFS and Garage, then removes AWS/runtime additions and rebuilds. Local profiles and admin UI are optional infrastructure, not capability dependencies.

- Email declares `dependsOn: []`; a backendless fixture types/builds with SMTP absent, tests real Mailpit SMTP/Chaos, then removes runtime/packages and rebuilds. Better Auth and telemetry are root-only integrations, never clean-consumer requirements.

These IDs are framework add-on dependencies. They are not entries in the reusable capability `requires` graph. Completed capabilities do not require one another.

## Disabling or removing a capability

Removal has two distinct scopes.

### Remove from the application

Remove the runtime/integration files, application-specific package dependencies and scripts, process/container wiring, tests, and shared-file registrations listed in the capability contract. Remove the capability ID from `referenceApplication.enabledCapabilities` because the root-like application no longer integrates it.

Retain database tables, schemas, and committed migration history by default. Removing code is not authorization to destroy data. For an already-deployed application, any later database deletion must be a new, explicitly reviewed migration.

The complete verified recipes are in [Starting a project](STARTING-A-PROJECT.md).

### Prune add-on authoring source from a downstream fork

After the application no longer uses a capability, a downstream fork that will never reinstall, distribute, or develop it may also:

1. Delete `capabilities/<id>/`.
2. Delete capability-specific evaluation and agent-skill files if no longer useful.
3. Keep the catalog ID when other roadmap entries reference it, set its status to `deferred`, and remove implementation-only fields such as scripts, environment, migrations, runtime services, documentation/skill/evaluation paths, and `tanstackAddOn`.
4. Update `ROADMAP.md` and user-facing docs.
5. Run `bun run capabilities:check`.

Keeping the stable catalog ID avoids breaking planned relationship references. This pruning is repository maintenance, not application uninstall behavior.

TanStack CLI currently has no automatic uninstall transaction for custom add-ons. Installing an add-on does not give the CLI enough semantic information to reverse arbitrary later TypeScript edits, so this starter does not pretend otherwise.

## Shared-file caveat

Additive capabilities such as Jobs are comparatively straightforward: they mostly add owned files and scripts around a baseline integration.

API Platform also registers a Better Auth plugin and extends the shared Drizzle schema. Its clean-scaffold installation is tested, but the official custom add-on format copies assets rather than semantically merging TypeScript. Installing API Platform into an already-customized application therefore requires review of `src/lib/auth.ts`, `src/db/schema.ts`, migrations, and navigation/route integration. The same review is required during removal.

This caveat is why the repository provides exact manual instructions instead of a brittle general-purpose uninstaller.

Observability owns an initial `src/start.ts` middleware registration. Review/merge any existing Start configuration and preserve explicit CSRF middleware. Its independent assets contain no Jobs/API imports; optional integrations live only in reference application route/worker wiring. The existing database-backed readiness endpoint retains its status/HTTP contract with additive safe metadata.

## Dependency handling

- **Requires:** a hard dependency on another reusable capability. The capability must not claim to work without it.
- **Integrates with:** an optional enhancement. Its absence must not prevent core operation.
- **External:** infrastructure or a remote service outside the reusable capability catalog.
- **Baseline requirement:** an always-present starter foundation, not a reusable capability edge.
- **TanStack add-on `dependsOn`:** a framework installation dependency resolved by the CLI, distinct from `requires`.

Hard capability dependencies stay sparse and acyclic. Optional integrations never become hard requirements merely because they are common companions.

## Verification

```bash
bun run capabilities:status
bun run capabilities:check
bun run add-ons:test jobs
bun run add-ons:test api-platform
bun run add-ons:test observability
bun run add-ons:test object-storage
bun run check
```

Then run the capability-specific database/worker/API smoke commands described in each `CAPABILITY.md`.
