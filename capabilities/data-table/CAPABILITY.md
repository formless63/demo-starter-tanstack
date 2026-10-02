# Data Table capability

Status: done; reference-enabled and optional (`defaultInstalled: false`). The reference verification imports the authored UI component and exercises its shared SSR/interactive fixture; clean generated consumers install it only when explicitly selected.

## Contract

Typed semantic React tables use the pinned native TanStack Table 9.2.4 `useTable` API and explicit feature registration. Import `DataTable` and `dataTableFeatures` from `src/components/data-table`; create typed columns with `createColumnHelper<typeof dataTableFeatures, YourRow>()` and `helper.columns(...)`, including nested group columns.

Data and columns should have stable references. `getRowId` is mandatory and must return a unique stable domain ID, never a page position. Sorting, global filtering, pagination, visibility and selection can each be internally owned (omit both props) or controlled (supply the value and matching `on*Change` callback). TypeScript rejects incomplete pairs. React setters accept both values and updater functions. The default internal page is index 0, size 20. Changing a slice from controlled to internal ownership preserves its last synchronized value and detaches the old callback; supplying a controlled pair again restores parent ownership. Manual pagination totals are explicitly cleared when omitted, so returning to client mode uses the actual row count.

The `children(table)` render prop provides the typed v9 table instance for application-owned filter inputs, page buttons, visibility menus and row selection controls. See `scripts/data-table-example.tsx` for a complete controlled example and internal-state example. Column definitions can render selection inputs through row APIs. Grouped headers, `colSpan`, native captions, column/column-group scopes, non-sortable display columns and `aria-sort` are preserved. Sort buttons use their rendered header as their accessible name; provide meaningful text for custom headers.

Set `manualSorting`, `manualFiltering` and/or `manualPagination` for independently server-owned operations. Supply `rowCount` or `pageCount` for server pagination (`pageCount: -1` denotes an unknown total). Supplied server rows are not sorted, filtered or paginated again when the respective flag is enabled. The application owns fetching, authorization, pending/error states, page resets on filter changes, out-of-range page handling and cancellation/stale-result suppression. In client pagination mode, native v9 also resets the page index after filtered/sorted row-model changes, including restoring a different parent query when controlled ownership resumes; manual pagination does not enable that automatic reset. Selection is keyed by stable IDs; the application owns pruning deleted records and selection across server pages. This module has no network requests or credentials and no virtualization, bulk action permission policy, exports or provider integration.

## Installation and removal

Install `capabilities/data-table/add-on.json` with TanStack CLI. Runtime adds only `@tanstack/react-table` 9.2.4. The portable browser regression fixtures add development-only Playwright and Bun type declarations and a `data-table:browser` script; no services, migrations or environment variables are needed by the component.

Manual removal: remove application imports, `src/components/data-table.tsx`, the `scripts/data-table-{example,client,browser}.tsx` and `scripts/data-table-remove.ts` fixtures, the `data-table:browser` script and `capabilities/data-table/CAPABILITY.md`; remove `@tanstack/react-table`. Remove Playwright and Bun type declarations only if no other tests use them. Then typecheck and rebuild. The official CLI has no uninstall transaction. Removing reusable authoring source is a separate choice. No stored user data is changed.

## Verification

`bun run data-table:browser` in a generated consumer verifies actual server HTML followed by hydration in Chromium and controlled/internal sorting, filtering, selection, visibility, pagination, grouped headers, manual bypass and unmount/remount. Install the browser with `bun x playwright install chromium`, or explicitly set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a system Chromium. Root source gate: `bun run data-table:browser` and `bun run data-table:typecheck`.

`bun run add-ons:test data-table` checks compiled artifact freshness, independent clean installation, TypeScript, real browser regression, production build and documented removal/typecheck/rebuild. Governance, root lint/typecheck/tests/build and full hosted CI remain required for subsequent changes. Acceptance passed on commit `51c143e0ff820fddba41ba3df90e96c9b9d9a04d`, including the real Chromium lifecycle and correct Stripe fixture connection draining, in [CI run 37004593622](https://github.com/formless63/demo-starter-tanstack/actions/runs/37004593622). This metadata promotion changes no runtime code, dependencies, migrations or generated-consumer defaults.
