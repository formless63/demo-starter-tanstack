---
name: appearance-change
description: Review, import and apply semantic appearance and color-mode policy.
---
# Appearance change

Read docs/APPEARANCE.md, DESIGN or its authoritative equivalent, the portable profile/theme schemas, and existing runtime/style files. Appearance is baseline tooling, never a capability or hard dependency.

Propose one named semantic theme with light/dark variants and supported/default/user selection policy. Show the provenance, concrete token/profile edits and font/accessibility implications before customization when approval has not already been given. Respect existing project authorization.

Use theme:import for bounded local/public JSON only. Never run shadcn add for untrusted themes, execute registry hooks/code, install dependencies, write arbitrary files, inject registry CSS or fetch fonts/assets. Inspect approved inputs as data. Local inputs must be vendored inside the repository for portable provenance; shared TweakCN registry endpoint URLs are supported directly. Review the normalized .project/theme.json, update approved profile provenance to match, then theme:apply. Source edits and application are separate explicit commands; theme:check/project:check detect pending drift.

Keep general styles separate from generated src/theme.css. Edit the normalized source, not generated output. The reference uses appearance/default-theme.json without a downstream config. Use light/dark/system persistence and SSR-safe early head logic; do not add Next dependencies, Lucide or a global state library. In the companion Nuxt starter retain @nuxtjs/color-mode and its native ThemeSelector, using the same conceptual profile/token contract rather than a second state system.

Non-system fonts require an explicit supply decision: self-hosted, supplied, approved external provider or system fallback. Record it in DESIGN/profile; font tokens do not supply files. Review contrast for foreground/background, primary, destructive, muted text and focus rings in both variants, plus keyboard/reduced-motion/responsive requirements. Parsing does not certify accessibility. Multiple named runtime themes are additional project UI scope, not a marketplace baseline.

Run theme:check, project:check, affected deterministic tests, normal verification and color-mode E2E/production hydration checks when runtime behavior changes. No network in hooks or CI fixtures.
