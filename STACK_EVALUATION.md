# Stack evaluation (September 2026)

## Versions and official scaffold

The evaluated baseline uses Bun 1.4.2, Node 24.21, PostgreSQL 18, React 19, TanStack Start/Router 1.x, Query 5, Form 1, Tailwind 4, Better Auth 1, Drizzle 0.45, Vite 8, and TypeScript 6. Explicit tested semver ranges are recorded in `package.json`; exact resolved versions are recorded in `.agents/context/stack.md` and `bun.lock`, so lockfile regeneration cannot silently follow `latest` tags.

The current official `@tanstack/cli` scaffold provided file-based Start routing, SSR Query plumbing, Vite, Tailwind, Biome, and devtools. Its inspected add-on catalog was used for `drizzle` (PostgreSQL), `tanstack-query`, `form`, `better-auth`, `shadcn`, and `t3env`. Table was correctly omitted because a small card list does not benefit from table machinery.

## Agent tooling

`--intent` added the Intent dependency and attempted project setup. The CLI reported that `@tanstack/intent install` failed, while on-demand `list` and `load` remain available. That is useful, lightweight version-matched discovery, but installer reliability and its error diagnostics are not yet polished enough to make hooks a hard prerequisite. Repository-owned skills remain the dependable baseline.

## Manual additions and wiring

Manual packages are Tabler Icons (the scaffold chose Lucide), Sonner, Vitest, and Playwright. Manual wiring was required for Better Auth's Drizzle tables/adapter, provider configuration, generic OIDC, optional magic links, protected route restoration, Projects server functions, shadcn-style UI, theme behavior, health checks, tests, container, CI, and Pocket ID provisioning.

- **Auth friction:** the official add-on enabled passwords by default, contrary to this starter's policy, and did not include generic OIDC or provider-aware UI. Better Auth's generic provider now participates in the standard social endpoint; verified discovery and PKCE are explicit. Magic link requires application-owned transport behavior.
- **Database friction:** Drizzle setup was direct and migration generation was reliable. Better Auth schema still needs care when maintained manually. Generated SQL is committed; push is not treated as deployment.
- **UI friction:** the shadcn add-on attempted to run its component installer and reported failure. Its catalog description still said Radix even though current requirements favor Base UI. The starter uses the generated Tailwind conventions, native controls where sufficient, Tabler, and Sonner rather than carrying unused primitives.
- **Bun:** installation, route generation, tests, and Vite builds work under Bun. TanStack's production artifact is most conservatively run with Node-compatible semantics, so the runtime image uses Node 24 rather than forcing Bun.
- **Docker/deployment:** the generic output is pleasantly provider-neutral. Database migrations remain an explicit release task rather than container startup side effects.
- **Testing:** unit and public browser testing are straightforward. CI supplies PostgreSQL, migrates a blank database, installs Chromium, and runs the E2E smoke path. Fully automated real OAuth still requires disposable provider credentials; authorization remains testable below that boundary.

## Undocumented behavior and prereleases

The CLI emitted a circular `replaceRouteChunk` warning during route generation and both shadcn component installation and Intent installation reported failure after the main scaffold succeeded. The official provider-neutral Nitro add-on requires `nitro@3.0.260610-beta`; this is the only prerelease and is accepted because the current TanStack CLI itself specifies it for self-contained Node output.

## Permanent-starter changes

For permanent use I would add a real transactional email adapter only when a mail provider is selected, expand authenticated integration tests with signed Better Auth sessions, and select a deployment adapter only at the first real deployment. I would also re-evaluate the shadcn add-on once its Base UI path and the Intent hook installer are consistently successful.
