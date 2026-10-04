# Project Bootstrap and Appearance evaluation

Evaluated October 1, 2026 in the TanStack starter after the architecture checkpoint. This pass resolves the eight pre-wave findings and adds baseline authoring tooling. It adds no runtime capability/catalog ID or dependency, and leaves the reference application’s eight enabled capabilities intact.

## Why the agent leads onboarding

Product reasoning belongs in a conversation grounded in supplied evidence. A giant CLI questionnaire cannot reliably reconcile an existing SPEC, design exports, migration repository and skill library. The canonical project-onboarding skill inventories PROJECT/SPEC/PRD/REQUIREMENTS/DESIGN, architecture/design-system material, README requirements, screenshots/mockups/diagrams, GUI design-AI exports and external guidance before asking questions. It explains found/inferred/ambiguous decisions, then interviews only missing relevant areas in small rounds. It never invents requirements to complete fields.

The concrete proposal includes preserved/normalized documents, capability decisions, appearance/fonts, source provenance and reviewed skill content. Explicit approval precedes customization and external skill imports/adaptations when not already authorized. Existing good filenames/content are retained. Templates supply concise PROJECT, behavioral SPEC and DESIGN conventions without creating fake reference product docs. Tooling validates/summarizes decisions; it is neither another capability manager nor an interactive wizard.

## Portable version-1 project model

The same conceptual TanStack/Nuxt contract comprises `.project/config.json`, sources.json, skills.json and theme.json. Canonical JSON schemas live in `.agents/schemas/`; strict Zod definitions emit the checked-in schemas and check their agreement. Version changes require migration review. Config has identity/summary, nullable relative document references, selected/deferred/excluded IDs, supported/default/user-selectable color mode, named theme provenance/file, optional font-supply decision and skill manifest reference.

Selected capabilities must exist, be done and include full hard dependency closure. States are disjoint, including duplicate rejection. Planned IDs can be deferred, never selected or replaced with one-off onboarding implementations. Requirement mapping distinguishes required, recommended/optional, excluded and unavailable choices. Capability-change still owns installations/removals/pruning, source versus enablement, sparse graph and retained data/migration policies. Read-only project status flags selection versus catalog application enablement drift without mutating it.

Sources record ID/type/title and appropriate repository file/public URL/supplied-material reference. Local files must exist, resolve inside the repository and avoid secret env files. Portable references exclude machine paths. Public HTTPS references reject credentials, queries and fragments. Errors report safe categories rather than bad values/bodies. Free-text content still needs human review; schemas cannot identify every possible secret or prove a URL is publicly accessible.

Skills classify compatible/adapt/redundant/project-specific/conflict/unsafe/irrelevant, with accepted/adapted/rejected/deferred decisions, explicit recorded approval, source ID and canonical installed path. Reviews cover Bun/framework/ORM/auth/migration/package-path assumptions, machine paths, provider-only syntax, bypass instructions, destructive Git and contradictory duplicates. Adaptations require matching decisions; unapproved, unsafe/conflicting and other rejected classes cannot be installed. Accepted paths must exist at `.agents/skills/<name>/SKILL.md`. No copied client skill trees, hook/MCP/permission/settings imports or automatic skill library installer.

`project:check` is bounded and network-free. An uninitialized reference succeeds but still validates schemas/templates/tooling and managed appearance. Configured consumers validate all manifests, references, capability closure, provenance, installed skills, theme and policy. `project:status` is concise/read-only. Existing SessionStart supplies only up to three bounded lines for configured consumers; no reference nag. Stop/AfterAgent selects cheap project checks for metadata, canonical or preserved docs, schemas/tooling/skills/prompt and managed theme surfaces. No new hook event, daemon, provider service or full test/network work is added to hooks.

## Reviewed theme import and generation

One named design theme has complete light/dark variants. The normalized object preserves a stable name/source/tokens contract; future named-preset collections can retain that object without inventing a runtime marketplace now. Reference source is `appearance/default-theme.json`, downstream source `.project/theme.json`. The starter’s blue palette is preserved; missing semantic fields are completed.

Token vocabulary: background/foreground, card/popover plus foregrounds, primary/secondary/muted/accent/destructive plus foregrounds, border/input/ring, chart 1–5, all sidebar fields, radius, sans/serif/mono fonts, tracking-normal, spacing and shadows 2xs/xs/sm/default/md/lg/xl/2xl. Both modes have every required token. Reviewed shared registry defaults are materialized into both effective maps. Dedicated `src/theme.css` owns only generated variables and Tailwind bridges; general styles import it and use semantic body fonts/tracking/focus rings. Deterministic generation compares exact CSS and `src/appearance-policy.ts`; unrelated styles are never rewritten.

`theme:import` reads validated normalized JSON or shadcn `registry:style` data. TweakCN preset `/r/themes/<preset>.json` and saved/shared `/r/themes/<id>` endpoints use the same JSON parser; no preset-specific network assumption is encoded. Local files need repository provenance; generic exports use shadcn-registry provenance, local TweakCN exports can declare `--kind tweakcn`. Normalized inputs retain their own provenance. Registry input records the reviewed URL/path. Import writes normalized data only; the user/agent reviews it and aligns approved profile provenance before explicit `theme:apply`.

Security boundary: actual-byte 128 KiB limit, UTF-8/JSON checks, public HTTPS without credentials/queries/fragments, ten-second fetch deadline, at most three redirects and DNS private-address screening. Network policy remains the DNS rebinding boundary. Only allowlisted cssVars fields survive. Missing tokens inherit reviewed defaults, with explicit light/dark background/foreground required. Unsupported types/unknown keys/unsafe CSS values fail. Known TweakCN tracking/shadow-component/letter-spacing helpers are ignored. Arbitrary registry css, files, dependencies, scripts, hooks and assets are discarded; no installer executes, packages install or remote assets/fonts download. Checks and CI fixtures never fetch TweakCN. Vendoring removes runtime availability/version drift and makes the reviewed theme reproducible.

## Framework color mode, fonts and accessibility

TanStack uses a small React external-store subscription, localStorage `theme`, media change and storage events, with a trusted policy-only head script setting dark class/color-scheme before paint. Deterministic server snapshots hydrate controls safely; only HTML theme attributes suppress expected differences. Selection is disabled until hydration to prevent early lost changes. The root synchronizer supports routes without a selector. Public and protected navigation use a compact native select with Tabler icons. Storage denial preserves in-tab selection. Unsupported preferences/fixed policies follow configured defaults. Light-only, dark-only, nonselectable system and selectable Light/Dark/System policies are represented without another state library or Next dependency.

Nuxt should retain its existing @nuxtjs/color-mode and ThemeSelector.vue with the same contract and framework-native generated CSS destination. This pass changes/tests TanStack only; it does not claim a companion runtime implementation or verification. No second Nuxt theme state system is introduced.

Font-family tokens do not supply fonts. Onboarding reviews non-system stacks and records self-hosted/project-provided/approved-external/system fallback in DESIGN/profile. No silent Google/provider dependency. Imported values do not certify accessibility: review text/background, primary pair, destructive states, muted text and focus rings in both modes, plus keyboard/responsive requirements. No dubious OKLCH contrast calculation is offered. Strict CSP deployments need an application-owned hash/nonce for the early script. Multiple runtime brands/themes remain explicit additional project UI scope.

## Deterministic consumer fixture

`fixtures/project-bootstrap/input/SPEC.md` is supplied before onboarding; no input PROJECT exists. The approved result preserves SPEC, adds concise PROJECT/DESIGN, selects Jobs/Object Storage/Webhooks with Jobs closure, defers planned Realtime, and uses system-default selectable modes. It vendors a local TweakCN modern-minimal style fixture and records accepted project-specific, adapted Bun, rejected conflicting and rejected unsafe skills, with two canonical installs. DESIGN explicitly approves system fallbacks without font downloads.

Tests provision this lightweight metadata fixture into an owned temporary repository with the current catalog/schemas/templates/tooling. They import local JSON, align the reviewed profile, apply appearance, run the real check/status/import/apply CLI, detect drift and clean up. No second application or network dependency is required.

## Architecture remediation and regression evidence

| Finding | Narrow correction | Evidence |
| --- | --- | --- |
| A01 | PostgreSQL 18 parent named-volume mount | `db:persistence:test` uses own Compose project, SHOW data_directory, sentinel, down/recreate and retained marker. Existing cluster stays intact; upgrade requires `docs/POSTGRES-VOLUME-MIGRATION.md`. |
| A02 | Enqueue-only boss disables schedule/supervise; standalone worker owns them | Reviewed producer options and containerized Jobs/Webhooks real enqueue/worker/retry tests. |
| A03 | Failed initialization cleans up, resets pending state; stop/restart barrier; worker partial-start cleanup | Jobs lifecycle failed-start/prepare and concurrent stop/restart tests, maintained clean fixture and real worker. |
| A04 | Compose app/worker Jobs env aligned; transactional enqueue checks canonical database | Empty/equivalent/different database tests, real transaction commit/rollback suite and root/combined consumer runtime. Separate Jobs databases remain valid for nontransactional sends; no outbox added. |
| A05 | Actual-byte/deadline JSON limit with safe 408/413/OpenAPI responses | Declared/dishonest/absent Content-Length, oversized bytes, stalled/canceled stream, JSON/schema tests and API fixture. |
| A06 | Generic overlap preflight, reviewed hard-dependency overlays and unified representative composition | Collision tests and API/Audit/Jobs combined clean install: unified four-entry journal, disposable migrate, API/Audit/Jobs runtime, explicit typecheck/build. Jobs/Webhooks reviewed registry overlay remains explicit. |
| A07 | Exact bounded concurrency/boolean/schema parsing and empty URL fallback | Strict malformed/empty/byte-bound config tests before connection; maintained Jobs fixture. |
| A11 | Older Jobs/API maintained explicit types/runtime/removal verification | Clean generated installs and runtime/package removal/rebuild, preserving schema/history/data; Webhooks transitive lifecycle also passed. |

Remaining dispositions are in docs/architecture/ARCHITECTURE_CHECKPOINT.md: A08 → Notifications governance, A09 → Ops/Admin URL sanitation, A10 → Notifications/Realtime ordered drains, A14 → Organizations auth/deployment parity. A12 CI cost and A13 documentation duplication remain accepted maintenance limitations. Public semantic add-on merging/upgrades/publication and customized manual removal remain accepted scope limits. This work adds no backend business process requiring those future corrections. No pre-wave code blocker or Critical/High finding remains.

## Verification results

- Frozen install passed without dependency/lockfile changes.
- Agent check passed; dedicated hook suite **127 passed**.
- Catalog check/status passed; same eight done/enabled capabilities and unchanged hard graph.
- Reference project check/status passed as uninitialized; theme check passed.
- Bootstrap/theme/color fixtures **51 passed**, including real CLI, strict profiles/sources/skills, malicious/oversize registry data, provenance, deterministic output, symlink safety, drift and policy/early script.
- Full `bun run check` passed: governance, project/theme checks, Biome, TypeScript, **251 tests, zero failures**, build.
- Development Playwright **9 passed**; production Node 24 non-root container Playwright **9 passed**, including persisted preferences, selector/system changes, reload, cross-tab, blocked storage, pre-application-script mode and hydration error monitoring. Existing auth/API/readiness smoke tests also passed.
- Affected Jobs/API Platform/Webhooks clean install/removal fixtures passed; reviewed database composition and named-volume persistence passed. Containerized Jobs migration/doctor/smoke and Webhooks real HTTP + retry suite passed.
- Untouched heavy Storage/Mailpit/Valkey suites were not rerun locally; they remain in unchanged maintained CI paths. No new network provider requirement is introduced.
- Docker Hub returned 429 for the standard two-stage image metadata lookup. Production verification used the newly built `NODE_ENV=production`, `NITRO_PRESET=node-server` output and operational bundles in a test image based on the cached exact Node runtime image; Dockerfile release behavior is unchanged. An initial test-env build emitted development JSX and failed production rendering; rebuilding explicitly for production corrected the verification setup. The successful production browser result refers to the corrected artifact. Standard CI retains the normal Docker build and now maintains production browser checks.
- Existing upstream module-directive/large Scalar chunk warnings remain nonfatal. Imported-theme accessibility and externally supplied fonts remain project review responsibilities.

Commit sequence: architecture remediation, project bootstrap contracts, appearance system, then documentation/tests/CI synchronization. No fake reference profile, new roadmap capability, external messages, destructive production operation or companion repository mutation.

## Official guidance inspected

Research used the current official sources on October 1, 2026: [TanStack hydration errors](https://tanstack.com/start/latest/docs/framework/react/guide/hydration-errors), [selective SSR](https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr), [Tailwind dark mode](https://tailwindcss.com/docs/dark-mode), [Tailwind theme variables](https://tailwindcss.com/docs/theme), [shadcn registry item JSON](https://ui.shadcn.com/docs/registry/registry-item-json) and [Vite dark mode guidance](https://ui.shadcn.com/docs/dark-mode/vite).

Inspected [TweakCN commit a3b47b3](https://github.com/jnsahaj/tweakcn/tree/a3b47b37cba97dd637de517aab52c45ec0f83456), particularly `app/r/themes/[id]/route.ts` (preset .json form or saved-theme ID, registry item schema validation) and `utils/registry/themes.ts` (cssVars theme/light/dark and additional CSS/helpers). The actual [modern-minimal endpoint](https://tweakcn.com/r/themes/modern-minimal.json) was read during research; its output is the local deterministic fixture. Tests/checks do not refetch it.

## Cold development startup

CI error capture exposed cold Vite shared-chunk invalidation during late browser dependency discovery. The client environment uses Vite’s `noDiscovery` option and the complete current browser entry list; TanStack still supplies native React/store entries and framework exclusions. New browser CommonJS dependencies must be added to that list, and pruning API Platform also prunes Scalar’s entry. SSR and production bundling behavior are unchanged. See [Vite dependency optimization](https://vite.dev/config/dep-optimization-options).

Appearance tests explicitly wait for the hydration-enabled selector (bounded fifteen seconds) before asserting the persisted value. They continue to reject dynamic import and hydration errors; no retry or error filter is used. The early-head test remains independent of application JavaScript. Cache-cleared development and production artifact suites both pass locally; final workflow evidence is attached to the PR.
