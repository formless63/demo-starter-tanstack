# Internationalization evaluation

## Decision

Use native i18next 26.4.2 / react-i18next 17.0.15, verified against the official package versions on 2026-10-02, with request-local instances and explicit plain-text contracts. Native React provider integration fits TanStack SSR without a translation framework or routing layer. No new hard dependency edges. Nuxt may use its native integration while retaining this framework-neutral locale/fallback/direction/time-zone/catalog/CLDR/initial-formatting/cancellation contract.

Sources: https://www.npmjs.com/package/i18next?activeTab=versions, https://www.npmjs.com/package/react-i18next?activeTab=versions, https://www.i18next.com/overview/configuration-options, https://www.i18next.com/misc/migration-guide, https://react.i18next.com/latest/i18nextprovider.

## Boundaries and alternatives

Do not add universal locale prefixes, redirects, browser detection, cookie persistence, remote catalogs, HTML translations or a global SSR engine. Application-owned query navigation is demonstrated only by the demo. Fixed trusted native Intl presets keep runtime input narrow. Serialized initial formatted values cover ICU differences; do not assume Node/browser punctuation parity. Arabic proves CLDR beyond English singular/plural.

## Acceptance

Local bounded catalog/interpolation/fallback/prototype rejection, concurrent request isolation and SSR unit verification passed during implementation. Final generated install/type/build/production/removal and hosted native Chromium gates remain required before status changes to done. No live third-party service or account is needed.
