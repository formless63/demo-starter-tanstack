# Repository Guidance

This repository is a personal TanStack Start full-stack starter.

## Core constraints
- Use Bun for package management and scripts and strict TypeScript.
- Prefer stable dependencies and official TanStack Start integrations.
- Keep server behavior in TanStack server functions/routes; do not add a general-purpose server framework.
- Use PostgreSQL/Drizzle migrations and Better Auth without passwords.
- Use Tailwind CSS 4, shadcn conventions, Base UI when appropriate, and Tabler Icons.
- Keep deployment provider-neutral and secrets out of Git.

## Working style
Inspect existing patterns, make coherent changes, run affected checks, fix regressions, and rerun checks. Ordinary non-destructive tests need no approval. Never test against production.

## Progressive context
Read only what matches the work: `.agents/context/architecture.md` for boundaries, `.agents/context/stack.md` for integrations, `.agents/context/commands.md` for verification, and a matching `.agents/skills/*/SKILL.md` for the defined workflows.

## Reusable capabilities
Reusable capabilities and their relationships are tracked in `ROADMAP.md` and `capabilities/catalog.json`. Before installing, removing, creating, or changing capability dependencies, use the capability-change skill. Hard dependencies must be explicit and must not form cycles.
