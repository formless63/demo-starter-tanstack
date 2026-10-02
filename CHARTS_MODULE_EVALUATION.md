# Charts evaluation

TanStack Charts was evaluated on 2026-10-02. The current npm package `@tanstack/react-charts` is `0.18.0` and remains alpha; it is not selected for this stable capability. Recharts `3.10.1` is the current registry version and supports React 19 and Node 18+. The wrapper uses Recharts for the responsive client enhancement while keeping a deterministic SSR SVG fallback until hydration completes.

The wrapper exposes line, bar, and area data with accessible names, an always-present screen-reader data table, finite-value filtering, and no animation. Recharts' responsive observer is owned by the mounted wrapper and is discarded when initialization is interrupted or the component unmounts.
