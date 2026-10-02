# Charts evaluation

TanStack Charts was evaluated on 2026-10-02. The current npm package `@tanstack/react-charts` is `0.18.0` and remains alpha; it is not selected for this stable capability. Recharts `3.10.1` is the current registry version and supports React 19 and Node 18+. The wrapper keeps the server-rendered SVG deterministic and uses a guarded `ResizeObserver` only for client enhancement.

The wrapper exposes line, bar, and area data with an accessible SVG title/description and an always-present screen-reader data table. No animation is used, and the observer disconnects on unmount.
