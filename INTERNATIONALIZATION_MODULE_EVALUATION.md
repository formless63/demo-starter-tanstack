# Internationalization evaluation

## Decision

Use native i18next 26.4.2 / react-i18next 17.0.15, verified against the official package versions on 2026-10-02, with request-local instances and explicit plain-text contracts. Native React provider integration fits TanStack SSR without a translation framework or routing layer. No new hard dependency edges. Nuxt may use its native integration while retaining this framework-neutral locale/fallback/direction/time-zone/catalog/CLDR/initial-formatting/cancellation contract.

Sources: https://www.npmjs.com/package/i18next?activeTab=versions, https://www.npmjs.com/package/react-i18next?activeTab=versions, https://www.i18next.com/overview/configuration-options, https://www.i18next.com/misc/migration-guide, https://react.i18next.com/latest/i18nextprovider.

## Boundaries and alternatives

Do not add universal locale prefixes, redirects, browser detection, cookie persistence, remote catalogs, HTML translations or a global SSR engine. Application-owned query navigation is demonstrated only by the demo. Fixed trusted native Intl presets keep runtime input narrow. Serialized initial formatted values cover ICU differences; do not assume Node/browser punctuation parity. Arabic proves CLDR beyond English singular/plural.

## Historical implementation checkpoint

Local bounded catalog/interpolation/fallback/prototype rejection, concurrent request isolation and SSR unit verification passed during implementation. Final generated install/type/build/production/removal and hosted native Chromium gates remain required before status changes to done. No live third-party service or account is needed.

## Final source acceptance and combined integration

Flow / Canvas source `a1a020cf7e75340e4f833c62db0d0b0e6b38d117` passed all 26 hosted jobs ([run 37051676575](https://github.com/formless63/demo-starter-tanstack/actions/runs/37051676575)); Internationalization source `d422d4b24d9ea4a5904870564041465d8e050ef2` passed all 26 hosted jobs ([run 37052978536](https://github.com/formless63/demo-starter-tanstack/actions/runs/37052978536)). Both sources and their composition were independently reviewed. The combined integration preserves accepted main ancestry, both exact source parents, runtime source bytes, authored/compiled parity, migrations and all inherited gates. There are now twenty-five completed, reference-enabled capabilities; every generated-consumer default remains false. The new combined head still requires its own complete hosted CI, including native development/production Chromium, provider verification and all generated-consumer install/removal lifecycles, before merge. Source CI success is not a combined-CI result.

Local combined verification passed governance, lint, root/module types, native Router held-navigation/Back proof, 33 Flow DOM regressions, 135 Rich Text DOM tests, Medusa fixed-clock parity, both add-on recompilations, official blank i18n packaging and the production build. Local DOM checks supplement hosted Chromium and do not replace it.
