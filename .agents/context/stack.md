# Stack snapshot

Exact resolved versions live in `bun.lock`; key versions are TanStack Start 1.168.58/Router 1.170.39/Query 5.103.2/Form 1.33.5, React 19.3.0, Better Auth 1.7.6, Drizzle ORM 0.45.3, Tailwind 4.3.3, Vite 8.3.1, TypeScript 6.0.3, Bun 1.4.2, Node 24.21.0, PostgreSQL 18, Vitest 3.2.7, and Playwright 1.63.0.

The official TanStack CLI supplied Start, file routing, Vite, Tailwind, Query, Form, Drizzle, Better Auth, t3-env, Biome, and shadcn wiring. The installed shadcn scaffold still selected Radix; new interactive primitives should use current Base UI recommendations and Tabler icons. Sonner provides feedback.

TanStack Intent was requested with `--intent`. The scaffold attempted project hooks but its installer failed, so runtime-free, on-demand usage remains available through `bunx @tanstack/intent list|load`; no large static skill map is injected. Application production output is Node-compatible and runs on Node 24; Bun owns installation, scripts, development, and builds.

Production delivery uses a multi-stage Docker image and plain Compose. The build pins Nitro's provider-neutral `node-server` preset, bundles the Drizzle migration runner into the same Node 24 image as the application, and copies only production output plus committed SQL. Compose supplies PostgreSQL 18, an explicit one-shot migration job, and a health-checked non-root application service; CI exercises this exact artifact path without OAuth credentials.
