---
name: capability-change
description: Installing, removing, creating, or changing reusable capabilities or their dependency relationships.
---
# capability change

1. Read `ROADMAP.md`, `capabilities/catalog.json`, and the capability's `capabilities/<id>/CAPABILITY.md` when it exists.
2. Check hard requirements, optional integrations, external requirements, environment, migrations, scripts, runtime processes, and deployment impact before editing.
3. Never silently add a hard dependency. Encode true hard dependencies in framework-native module or add-on metadata when supported; optional integrations must remain optional.
4. Keep the hard-dependency graph sparse and acyclic. Baseline starter components are prerequisites, not optional capability edges.
5. Treat `defaultInstalled` and reference-application enablement as different facts. `defaultInstalled` says whether a clean generated consumer receives the capability without choosing it; `referenceApplication.enabledCapabilities` says what this repository integrates and proves.
6. Update `ROADMAP.md`, `capabilities/catalog.json`, and the implemented capability's `CAPABILITY.md` in the same change.
7. For a TanStack custom add-on, keep official source, authoring metadata, retained distributable, and clean-install fixture together under `capabilities/<id>`; rebuild with `bun run add-ons:compile <id>`.
8. Treat application removal and removal of reusable add-on source as separate choices. Preserve database data and migration history by default, document shared-file edits explicitly, and never claim the CLI provides an uninstall transaction when it does not.
9. Test clean installation and documented removal where applicable. Run `bun run capabilities:status` and `bun run capabilities:check` after catalog changes.
10. Run `bun run add-ons:test <id>` when applicable, capability-specific tests and smoke checks, then normal repository verification and the affected production artifact path.

## Definition of Done

For a new reusable capability, where applicable:

- Mark the catalog entry `in-progress` before implementation; update relationships and ROADMAP together.
- Provide `capabilities/<id>/CAPABILITY.md`, a declared evaluation document, complete framework package/add-on metadata, and a clean consumer fixture.
- Verify clean installation and documented clean removal/pruning, preserving data by default.
- Integrate and verify the reference application when intentionally enabled; keep this separate from generated-consumer defaults.
- Update the README capability table, `docs/CAPABILITIES.md`, `docs/STARTING-A-PROJECT.md` removal/pruning recipe, and relevant `.agents/context` files.
- Add a domain-specific skill only when meaningful maintenance rules justify it. Do not create a domain skill solely because a capability exists.
- Run `capabilities:status`, `capabilities:check`, normal task verification, applicable lifecycle/production checks, and full CI.
- Change status to `done` only after verification passes.
