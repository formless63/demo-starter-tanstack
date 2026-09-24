# Repository Guidance

This repository is a personal TanStack Start full-stack starter.

## Core constraints

- Use Bun for package management and scripts.
- Use TypeScript with strict checking.
- Prefer current stable dependencies; avoid prereleases unless required and documented.
- Use TanStack Start and framework-native server functions/routes. Do not add Hono, Fastify, or Express.
- Use PostgreSQL with Drizzle.
- Use Better Auth with password authentication disabled.
- Authentication should support GitHub OAuth and generic OIDC; magic links may be an optional fallback.
- Use Tailwind CSS 4, shadcn/ui with the current recommended primitives, and Tabler Icons.
- Keep deployment provider-neutral.

## Working style

- Reuse existing patterns before introducing new abstractions.
- Prefer official framework integrations and current official documentation.
- Make coherent changes and verify them locally.
- Fix failures caused by the requested work and rerun affected checks.
- Ordinary non-destructive local tests do not require approval.
- Never commit secrets or use production systems merely to validate local work.

## Context

Read only what is relevant to the task:

- `.agents/context/architecture.md` for architectural or boundary changes.
- `.agents/context/stack.md` for dependency or integration decisions.
- `.agents/context/commands.md` for canonical development and verification commands.
- `.agents/skills/` contains task-specific workflows; use a skill only when its description matches the work.

Keep this file concise. Put task-specific procedures in skills rather than expanding always-loaded instructions.
