---
name: capability-change
description: Installing, removing, creating, or changing reusable capabilities or their dependency relationships.
---
# capability change

1. Read `ROADMAP.md`, `capabilities/catalog.json`, and the capability's `capabilities/<id>/CAPABILITY.md` when it exists.
2. Check hard requirements, optional integrations, external requirements, environment, migrations, scripts, runtime processes, and deployment impact before editing.
3. Never silently add a hard dependency. Encode true hard dependencies in framework-native module or add-on metadata when supported; optional integrations must remain optional.
4. Keep the hard-dependency graph sparse and acyclic. Baseline starter components are prerequisites, not optional capability edges.
5. Update `ROADMAP.md`, `capabilities/catalog.json`, and the implemented capability's `CAPABILITY.md` in the same change.
6. For a TanStack custom add-on, keep official source, authoring metadata, retained distributable, and clean-install fixture together under `capabilities/<id>`; rebuild with `bun run add-ons:compile <id>`.
7. Test clean installation and removal where packaging supports them. Do not make removal silently destroy retained data.
8. Run `bun run capabilities:check`, `bun run add-ons:test <id>` when applicable, capability-specific tests and smoke checks, then normal repository verification and the affected production artifact path.
