# Data Table evaluation

The implementation pins `@tanstack/react-table` 9.2.4 and follows the installed official v9 declarations and package skills: `useTable`, explicit feature registration, v9 column/helper generics and `table.FlexRender`. The previous public checkpoint incorrectly used v8 APIs with v9 dependencies; it was not releasable.

Explicit sorting, global/column filtering prerequisites, pagination, selection and visibility features are registered with their row models. Typed value/callback pairs prevent accidentally frozen controlled state; omission delegates ownership to Table. Rendering preserves grouped headers, non-sortable display columns, captions, semantic scope and `aria-sort`.

The module stays independent of fetching, auth, Search and provider integrations. Applications control manual server rows, cancellation, stale responses, out-of-range pagination and selection pruning. No virtualization or bulk-operation policy is implied. Native Table is preferred over custom row-processing logic; no v8 compatibility wrapper is used.

Verification is encoded in focused TypeScript/DOM tests and a portable real SSR-to-Chromium hydration fixture shipped to a clean generated consumer. The lifecycle additionally builds, removes owned runtime and fixtures, and rebuilds. Real browser evidence and hosted checks must pass before completion; DOM emulation is not reported as browser execution.
