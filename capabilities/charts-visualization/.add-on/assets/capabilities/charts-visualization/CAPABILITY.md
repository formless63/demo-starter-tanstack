# Charts / Visualization capability

This optional client capability provides SSR-safe accessible line, bar, and area chart primitives. It has no hard capability dependencies, migrations, server processes, environment variables, or provider credentials. Recharts supplies the client enhancement; a deterministic SVG frame is emitted during SSR and hydration, then enhancement starts in an effect. Responsive observers are cleaned up on unmount. A semantic data-table fallback is always included, invalid/missing values remain readable as “Not available”, and animation is disabled for reduced-motion safety.

Install `capabilities/charts-visualization/add-on.json` through the normal TanStack CLI custom add-on flow. For removal, stop using `Chart`, delete its owned source/tests, run `bun remove recharts`, then run `bun run typecheck && bun run build`; unrelated source and data remain untouched. No migration or persisted data cleanup is required.
