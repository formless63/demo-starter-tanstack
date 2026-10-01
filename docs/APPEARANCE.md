# Appearance

Appearance is baseline tooling: one named semantic design theme, complete light/dark token maps, and a configurable color-mode policy. No appearance catalog ID, runtime TweakCN service or new UI/state dependency is added. The reference keeps its blue palette and defaults to selectable Light/Dark/System with system preference.

## Sources and application

The reference source is `appearance/default-theme.json`. A downstream consumer uses `.project/theme.json` and `.project/config.json` appearance policy. `theme.schema.json` shares a framework-neutral version-1 contract: name, source type/reference, shared theme metadata and complete effective light/dark maps. Shared registry defaults are materialized into both modes during normalization; edit the effective mode maps for mode-specific changes. Current generation uses one preset; a future named-preset collection can wrap the unchanged theme object.

```bash
bun run theme:import -- input/theme.json
bun run theme:import -- input/tweakcn-modern-minimal.json --kind tweakcn
bun run theme:import -- https://tweakcn.com/r/themes/modern-minimal.json
# Saved/shared TweakCN theme registry URLs /r/themes/<id> also work.
# Review tokens, provenance and typography; align the approved project profile.
bun run theme:apply
bun run theme:check
bun run project:check
```

Import vendors normalized data; it does not apply CSS or alter the project plan. For an existing profile, update appearance.theme name/source/reference to the reviewed imported values before application. `theme:apply` generates only `src/theme.css` and `src/appearance-policy.ts`. `src/styles.css` imports the managed token layer and owns unrelated app styles. `theme:check` compares exact deterministic output and policy; `project:check` includes that check when the appearance source is present. An explicitly imported theme can also be applied without a full profile using the reference mode policy. No fake profile is generated automatically.

## JSON security boundary

The importer reads local normalized themes or shadcn `registry:style` JSON. Local input must resolve inside the repository; vendor supplied JSON there first. URL input requires public HTTPS without credentials, query strings or fragments. It has a 10-second total deadline, at most three redirects, a 128 KiB actual-byte limit, UTF-8/JSON validation, and public-address DNS screening. Network controls remain responsible for DNS rebinding protection. Failures never print response bodies/credentials or offending values. No network occurs in checks or fixture tests.

Only allowlisted `cssVars.theme`, `.light`, `.dark` values survive normalization. Missing tokens inherit reviewed starter defaults; background/foreground in both input modes are required. Non-style registry types, unknown semantic keys and unsafe/malformed values fail. Known TweakCN derived tracking/shadow-component/letter-spacing helpers are ignored; arbitrary registry `css`, dependencies, devDependencies, files, scripts, hooks and assets are ignored completely. Nothing runs a registry installer. Baseline body letter-spacing uses `--tracking-normal`. Normalized imports preserve their own provenance; registry imports record the local path/URL and source kind. Local TweakCN exports use explicit `--kind tweakcn` because file content alone cannot prove its origin.

Tokens cover background/foreground, card/popover and their foregrounds, primary/secondary/muted/accent/destructive and foregrounds, border/input/ring, chart 1–5, complete sidebar tokens, radius, sans/serif/mono fonts, tracking-normal, spacing and shadows 2xs/xs/sm/default/md/lg/xl/2xl. The dedicated generator also bridges them into Tailwind 4 utility namespaces. Deliberately bounded CSS grammars support common hex, RGB/HSL/OKLCH/OKLab values, length units, font stacks and shadows; arbitrary calc/var/URL expressions are excluded from imported values. Parsing is not a contrast checker.

## Color mode and hydration

TanStack uses a small React external-store subscription with localStorage key `theme`. System preference follows matchMedia changes, selection persists, other tabs synchronize, and blocked storage leaves selection working for the current tab. Unsupported saved preferences fall back to policy. Light-only/dark-only or nonselectable consumers ignore conflicting saved choices. The selector uses a labeled native select and Tabler icons in both public and protected navigation.

The trusted policy-only head script sets the HTML dark class/color-scheme before paint. Controls hydrate with a deterministic server snapshot, then subscribe to browser preferences. Only HTML theme attributes suppress hydration differences; content does not. The root synchronizer covers routes without a selector. Strict CSP deployments must authorize this generated inline script with a hash or an application-owned nonce before blocking inline scripts.

The companion Nuxt implementation should retain its existing @nuxtjs/color-mode and ThemeSelector.vue, using the same profile/token vocabulary and app/assets/css/theme.css destination. This pass changes and verifies TanStack only; no companion runtime has been ported or certified.

## Fonts and accessibility

Theme fonts are family tokens, not files. Nothing downloads Google Fonts or other assets. Choose self-hosted, project-provided, explicitly approved external provider or system fallback; record the choice in DESIGN and optional config appearance.fonts. External font names will use CSS fallbacks until supplied. Import does not silently replace a requested font or create provider traffic.

Review foreground/background, primary pair, destructive states, muted text and visible focus rings in both modes. Add project acceptance requirements for keyboard interaction, responsive density and accessibility. Valid tokens do not certify compliance; no inaccurate OKLCH contrast claim is made. A runtime multi-theme/brand picker remains a separate project requirement.
