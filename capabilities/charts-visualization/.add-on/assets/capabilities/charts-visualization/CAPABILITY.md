# Charts / Visualization capability

This optional client capability provides SSR-safe accessible line, bar, and area chart primitives. It has no hard capability dependencies, migrations, server processes, environment variables, or provider credentials. The SVG frame is deterministic during SSR; client-only `ResizeObserver` enhancement is cleaned up on unmount. A semantic data-table fallback is always included and animation is disabled for reduced-motion safety.
