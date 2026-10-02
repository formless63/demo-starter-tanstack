# Data Table capability

Status: done; optional (`defaultInstalled: false`). The root reference does not enable this UI-only add-on; generated consumers opt in explicitly.

## Contract

This capability provides a typed, semantic React table built on `@tanstack/react-table` 9.2.4. Callers own data fetching, authorization, and stale-response cancellation. Sorting, global filtering, pagination, column visibility, and row selection are controlled state. Set the `manual*` flags and provide `pageCount` for server-driven modes. Stable row IDs are required through `getRowId`; v1 has no virtualization.

The renderer uses a real `<table>`, `<caption>`, `<thead>`, `<th scope="col">`, and keyboard-operable sort buttons. Empty, repeated, and interrupted updates are safe because the component has no effects, timers, fetches, or subscriptions; the caller can discard stale results before updating its controlled state. It is SSR/hydration-safe because it does not read browser globals.

## Installation and removal

Install the compiled `capabilities/data-table/add-on.json` with TanStack CLI. It adds only `@tanstack/react-table` 9.2.4 and `src/components/data-table.tsx`; no migrations, environment variables, services, or provider credentials are involved. Removal is manual: remove imports and the component, remove the package, then rebuild. TanStack CLI has no uninstall transaction.

## Verification

Run `bun run capabilities:status`, `bun run capabilities:check`, `bun run add-ons:test data-table`, `bun run lint`, `bun run typecheck`, `bun test`, and `bun run build`. The clean fixture must build without unrelated official add-ons. The package version was verified against the npm registry and TanStack's documented `useReactTable`/row-model API.
