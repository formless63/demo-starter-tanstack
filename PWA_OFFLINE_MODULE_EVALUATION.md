# PWA / Offline evaluation

Evaluated 2026-10-02. Selected stable native vite-plugin-pwa 1.3.0 injectManifest and Workbox build 7.4.1; no Workbox runtime caching defaults or framework replacement. Official sources: https://github.com/vite-pwa/vite-plugin-pwa/releases and https://github.com/GoogleChrome/workbox/releases ; custom registration/injection: https://vite-pwa-org.netlify.app/guide/inject-manifest and https://vite-pwa-org.netlify.app/guide/register-service-worker .

A generic app-shell precache is rejected because TanStack SSR/auth state cannot safely be treated as public offline data. V1 limits content to an inert HTML notice plus explicit immutable public icons. Integrity enforces build bytes; response policy adds defense in depth. Runtime uses browser primitives and no user-data cache. Native plugin is restricted to Vite's client environment, avoids automatic manifest precaching, and emits to the resolved real client directory before Nitro indexes static assets. This is a small build adapter around the official plugin, not a replacement service-worker compiler.

Alternatives: generateSW has broader defaults and less inspectable install fetch behavior; blanket precache and runtime stale-while-revalidate could persist sensitive responses. TanStack DB/local-first sync is a separate future evaluation, not included here. Push, notification transport and replay of mutations are deliberately out of scope.

Acceptance state: in progress. Source policy/unit checks, isolated native production build and root Start/Nitro production build are locally runnable; local Chromium is prohibited by platform, so actual native worker/offline/update/retirement and complete clean lifecycle require hosted CI. No local-only result advances completion. Record exact hosted source head and CI run before marking done.

See capabilities/pwa-offline/CAPABILITY.md for the exact threat model and two-phase SAME-URL retirement contract. Merely removing files is not retirement. Synthetic installation events are negative tests only; no device-installation certification is claimed.
