# Reusable capability roadmap

This roadmap governs reusable capabilities for the personal starter. It records intent and dependency boundaries; it is not an instruction to install every listed library. Machine-readable metadata lives in `capabilities/catalog.json` and is validated by `bun run capabilities:check`.

## Relationship vocabulary

- **Requires** is a hard dependency on another capability. The capability must not claim to work without it.
- **Integrates with** is an optional enhancement. The capability remains useful when the integration is absent.
- **External** is required or optional infrastructure outside this capability catalog.

Baseline components are prerequisites of this repository, not capability modules. They are recorded separately and must never be placed in `requires` or `integratesWith`. The hard-dependency graph is intentionally sparse and acyclic.

## Base starter contract — not modules

Every capability may rely on the documented starter foundation when explicitly listed as a baseline requirement: TanStack Start, strict TypeScript, Bun tooling, Node production runtime, PostgreSQL, Drizzle with explicit migrations, Better Auth without passwords, GitHub OAuth, generic OIDC, Pocket ID development provisioning, Tailwind CSS 4, the shadcn-style component system, Tabler Icons, Docker/Compose, CI/testing, and agent scaffolding.

These foundations are not independently installable capabilities and must not be modeled as optional module dependencies.

## Current status

`Jobs`, `API Platform / Machine Auth / OpenAPI`, `Observability`, `Object Storage`, `Email`, `Webhooks`, `Audit Log`, `Cache / Coordination`, `AI`, `Search`, `Realtime`, `Notifications`, `Import / Export`, `Ops / Admin`, `Invoice Ninja`, `Stripe`, `Medusa`, `Charts / Visualization`, `Command System`, `Data Table`, `Markdown / Code Content`, `File UI`, `Rich Text / Tiptap`, `Flow / Canvas`, `Internationalization`, and `PWA / Offline` are twenty-six completed reusable capabilities. All are enabled in the root reference application so integration and deployment paths stay tested. Each has `defaultInstalled: false`: a clean base/generated consumer receives a capability only when it explicitly selects or installs it.

Organizations, Authorization and Feature Flags are additionally reference-enabled but remain **in-progress** with `defaultInstalled: false`. This source-only integration has no current acceptance result: all integrated-tree governance, packaging, lifecycle, backend, browser, production and exact-head CI gates remain pending. Historical source results are not proof for this tree. Fault-injection fixtures remain paused pending separate review and authorization; no gate is waived.

`defaultInstalled` never means “currently wired into the reference application.” Reference-app integration is tracked separately in `capabilities/catalog.json`. No package is installed merely because it appears in this roadmap.

## Custom add-on workspace

This repository is a catalog-style monorepo for independently installable TanStack custom add-ons. An implemented add-on owns one directory:

```text
capabilities/<id>/
├── CAPABILITY.md
├── .cta.json                 # capability-local TanStack authoring context
├── .add-on/                  # official custom add-on source metadata and assets
├── add-on.json               # retained, compiled TanStack distributable
└── test/clean-install.json   # disposable scaffold expectations
```

The official pinned TanStack CLI compiles each `.add-on` directory; repository scripts only discover entries from `capabilities/catalog.json`, invoke that CLI, and verify clean installation. They are not an alternative generator. Each catalog entry records its stable TanStack add-on ID; add-on `dependsOn` and conflict sets use those CLI IDs, while capability `requires` uses capability IDs. The checker ensures completed hard capability dependencies are also expressed in official add-on metadata. `bun run add-ons:compile` rebuilds every declared distributable, while `bun run add-ons:test <id>` verifies that the committed output is current, installs it through normal TanStack mechanics into a clean scaffold, resolves official dependencies, and builds the result.

Only implemented capabilities receive an add-on directory. In-progress identity workspaces are retained for source preparation and future acceptance; their presence is not a completion claim. Planned entries remain catalog metadata until implementation, and installing one add-on never installs the rest of the catalog. Distributables stay under `capabilities/<id>/add-on.json`; external publication is intentionally deferred.

### Done

| Capability | Requires | Integrates with | External | Reference app | Default installed | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Jobs | None beyond baseline PostgreSQL and configured Drizzle | Observability, Ops / Admin | PostgreSQL | Enabled | No | Done |
| API Platform / Machine Auth / OpenAPI | None beyond baseline Better Auth, PostgreSQL/Drizzle, and server runtime | Audit Log, Observability, Authorization, Organizations | None beyond baseline PostgreSQL | Enabled | No | Done |
| Observability | None beyond baseline Start + Node runtime | Every server/runtime capability where useful, including Jobs and API Platform | Optional OTLP destination | Enabled | No | Done |
| Object Storage | None; no database/auth dependency | Jobs, Observability | S3 when used; tested RustFS 1.0.0 preferred / Garage 2.4.1 | Enabled | No | Done |
| Webhooks | Jobs | Audit Log, Observability, API Platform | Remote webhook endpoints when used | Enabled | No | Done |
| Email | None; no database/auth dependency | Jobs, Observability; baseline Better Auth wiring | SMTP when used; optional Mailpit v1.31.3 | Enabled | No | Done |
| Audit Log | None beyond baseline PostgreSQL and Drizzle | API Platform, Organizations, Jobs, Invoice Ninja, Stripe, Medusa | PostgreSQL | Enabled | No | Done |
| Cache / Coordination | None; no database/auth dependency | Realtime, API Platform, Jobs, Observability | Valkey/Redis-compatible service on use; tested Valkey 9.1.2 | Enabled | No | Done |
| Search | None beyond baseline PostgreSQL and Drizzle | Jobs, Object Storage, Organizations | PostgreSQL only | Enabled | No | Done |
| Realtime | None; baseline Node runtime / human authentication | Cache / Coordination, Notifications, Observability | None | Enabled | No | Done |
| Notifications | Jobs; baseline PostgreSQL/Drizzle | Email, Realtime, Audit Log, Observability | Optional ntfy; optional SMTP through Email | Enabled | No | Done |
| AI | None beyond baseline Node runtime | Jobs, Object Storage, Observability, Audit Log | Configured model provider only on use | Enabled | No | Done |

AI uses a private OpenAI-compatible adapter with pinned OpenAI SDK 7.25.0, real incremental streaming, authoritative application-owned Zod validation through a single deadline/cancellation scope, stop-only structured success and no retries. It is backendless at normal build/start/worker/readiness; generic clean lifecycles execute local HTTP fixtures under Bun and Node, and shared production smokes execute the final image without production credentials. See [evaluation](AI_MODULE_EVALUATION.md).

Object Storage uses standard AWS SDK v3, with real private streaming/presign/multipart verification on RustFS and Garage. Optional third-party Noooste Garage UI 0.13.0 is infrastructure, not a capability dependency. No storage is needed for build/start; application owners decide readiness policy. MinIO is not the default. Email pins Nodemailer 10.0.13 for lazy provider-neutral SMTP with explicit TLS, safe messages/errors, no retries, and awaited Better Auth magic links. Mailpit v1.31.3 verifies real SMTP and deterministic Chaos; no provider SDK or generic queue is added.

### Application infrastructure

| Capability | Requires | Integrates with | External | Status |
| --- | --- | --- | --- | --- |
| Import / Export | Jobs, Object Storage | Notifications, Audit Log | None additional | Done |

### Identity / policy

| Capability | Requires | Integrates with | External | Status |
| --- | --- | --- | --- | --- |
| Organizations / Tenancy | Starter authentication | Audit Log, Notifications | PostgreSQL | In progress |
| Authorization | Starter authentication | Organizations, API Platform, Audit Log | PostgreSQL | In progress |
| Feature Flags | None | Organizations, Authorization, Audit Log | PostgreSQL | In progress |

Starter authentication is a baseline requirement, not a capability edge.

### Business integrations

| Capability | Requires | Integrates with | External | Status |
| --- | --- | --- | --- | --- |
| Invoice Ninja | Jobs, Webhooks | Organizations, Audit Log, Notifications | Invoice Ninja | Done |
| Stripe | Jobs, Webhooks | Organizations, Authorization, Audit Log, Notifications | Stripe | Done |
| Medusa | Jobs, Webhooks | Object Storage, Organizations, Search | Medusa 2.21.2 | Done |

### Operations / UI infrastructure

| Capability | Requires | Integrates with | External | Status |
| --- | --- | --- | --- | --- |
| Ops / Admin | Starter authentication + Node runtime | Observability, Jobs, Audit Log, Object Storage, Cache / Coordination, Webhooks | None | Done |
| Command System | None | Search, Authorization | None | Done |
| Data Table | None | Search, Organizations, Authorization | None | Done |
| Markdown / Code Content | None | Object Storage, AI | None | Done |
| Charts / Visualization | None | Data Table, Realtime | None | Done |
| File UI | Object Storage | Jobs, Search | None | Done |
| Rich Text / Tiptap | None | Object Storage, Markdown / Code, Realtime, Organizations | None | Done |
| Flow / Canvas | None | Realtime, Object Storage, Audit Log | None | Done |

### Client / platform

| Capability | Requires | Integrates with | External | Status |
| --- | --- | --- | --- | --- |
| PWA / Offline | None | Notifications, Realtime | None | Done |
| Internationalization | None | UI-facing capabilities | None | Done |

## Dependency direction

The implemented and planned hard edges are:

```text
Webhooks ───────────────► Jobs
Notifications ─────────► Jobs
Import / Export ───────► Jobs + Object Storage
Invoice Ninja ─────────► Jobs + Webhooks
Stripe ────────────────► Jobs + Webhooks
Medusa ────────────────► Jobs + Webhooks
File UI ───────────────► Object Storage
```

Optional integrations may point in either useful direction and do not imply installation order. Changes to hard edges require an explicit catalog, roadmap, and capability documentation update in the same change.

## Framework and library evaluations — not modules

These are research tracks, not automatically installed capabilities.

### TanStack repository

- TanStack DB for local-first collections and synchronized client data.
- TanStack AI as a possible implementation option for the AI capability.
- TanStack Hotkeys for the Command System.
- TanStack Pacer for rate, debounce, and throttle primitives.
- TanStack Virtual for large tables and lists.
- TanStack Charts for Charts / Visualization when appropriate.
- TanStack Markdown / Highlight for Markdown and code content.
- TanStack Intent for agent discovery once project-hook reliability is sufficient.

### Nuxt repository

- Appropriate maintained Nuxt Modules ecosystem integrations.
- VueUse for Vue-native client composables.
- Nuxt Content when content requirements justify it.
- Vue-native equivalents for capabilities that use TanStack- or React-specific UI libraries here.

## Implementation governance

Before installing, removing, or changing a capability, use `.agents/skills/capability-change/SKILL.md`. An implemented capability must own a `capabilities/<id>/CAPABILITY.md`, accurately declare scripts, environment, migrations, runtime processes, infrastructure, installation/removal, upgrade concerns, verification, and agent guidance, and link any evaluation document. Custom add-ons also own their official source metadata, retained distributable, declared dependencies, documented conflicts, and clean-install fixture. CI derives its completed-add-on matrix from the catalog, so a new implementation extends metadata rather than copying a workflow job. Clean installation and removal should be tested where the packaging supports them.

Webhooks uses Standard Webhooks HMAC v1 with exact raw-byte verification, stable serialized events, application-owned targets/secrets, and the existing Jobs worker for bounded native pg-boss retries. Its disposable HTTP/Jobs fixture runs through the generic custom dependency transport. DNS/network policy and durable inbound replay storage remain explicit application responsibilities.

Architecture pre-wave remediation keeps the sparse dependency graph unchanged: bounded producer/runtime recovery, reviewed custom file-collision preflight, strengthened clean removal fixtures and a unified database-composition proof. Publication/general semantic merging remains deferred.

## Starter authoring / project bootstrap — not capabilities

Agent-led existing-material onboarding, portable `.project` profiles/provenance/skill reviews, semantic theme import/generation and Light/Dark/System policy are baseline starter tooling. See `docs/PROJECT-ONBOARDING.md` and `docs/APPEARANCE.md`. They introduce no capability IDs or hard dependency edges and do not advance a planned runtime capability. Deferred profile selections remain unavailable until implemented through capability governance.

Bounded baseline maintenance aligns Better Auth/API Key and the bundled Drizzle adapter at 1.7.7, canonical Jobs process roles/native attempt context and routing-safe transactional enqueue, and Project input limits (name 120, description 1000). All twenty-six completed capabilities remain opt-in for clean consumers and enabled in the root reference; baseline maintenance adds no hard capability edges.

Search v1 uses explicit simple PostgreSQL18 full-text search, weighted A/B STORED vectors and GIN in application-owned tables, ts_rank_cd normalization32 and bounded canonical numeric-float4 keysets with six-digit timestamps and opaque IDs. The disposable lifecycle database survives the generic final removal build before rows/vector/GIN/history checks and teardown. The root Projects POST integration enforces existing owners. Add-on assets install no universal search table or production domain migration.

Invoice Ninja, Stripe and Medusa v1 are completed independent Jobs/Webhooks add-ons and are enabled in the reference application. Their full combined lifecycle/browser/canonical production gates passed, including pinned native Invoice Ninja and Medusa fixtures and local Stripe SDK/protocol/persistence proof. Clean defaults remain opt-in. Completion does not certify live financial operations or operator deployments; trusted policy, provider configuration and remote setup remain application responsibilities. See their evaluation documents for exact implementation acceptance evidence.

Rich Text / Tiptap v1 is completed and reference-enabled: independent optional add-on, bounded JSON schema, escaped SSR plus client-only Tiptap, accessible controlled editing and explicit undo reset boundaries. Full combined exact-head CI gates integration merge; no persistence/provider/collaboration integration in v1.
### File UI implementation

File UI is completed, reference-enabled, opt-in, and requires only Object Storage. The frozen v1 contract covers bounded proxy upload, durable scoped idempotency/atomic metadata seams, cancellation quarantine, safe attachment downloads and accessible UI. Root Better Auth/PostgreSQL integration is separate from the synthetic no-DB consumer. Accepted source hosted lifecycle and CI gates passed; combined exact-head CI is required before merge; see `capabilities/file-ui/CAPABILITY.md` and `FILE_UI_MODULE_EVALUATION.md`.

## Combined content-module acceptance

Both independently reviewed source heads passed full hosted CI: Rich Text `4754559bba71c36c357325f9b4d1231d3808d0cf` ([24 jobs](https://github.com/formless63/demo-starter-tanstack/actions/runs/37034217024)) and File UI `73c442b9b8729e17c8cb30a6879d87da80f31c5b` ([24 jobs](https://github.com/formless63/demo-starter-tanstack/actions/runs/37036091357)). This combined integration retains their accepted runtime and all inherited gates. The published combined head still requires its own complete hosted CI before merge; source success is not a combined-CI claim.

## Flow / Canvas and Internationalization acceptance

Flow / Canvas source `a1a020cf7e75340e4f833c62db0d0b0e6b38d117` passed all 26 hosted jobs ([run 37051676575](https://github.com/formless63/demo-starter-tanstack/actions/runs/37051676575)); Internationalization source `d422d4b24d9ea4a5904870564041465d8e050ef2` passed all 26 hosted jobs ([run 37052978536](https://github.com/formless63/demo-starter-tanstack/actions/runs/37052978536)). Both sources and their composition were independently reviewed. The combined integration preserves accepted main ancestry, both exact source parents, runtime source bytes, authored/compiled parity, migrations and all inherited gates. That integration brought the catalog to twenty-five completed, reference-enabled capabilities; every generated-consumer default remains false. The new combined head still requires its own complete hosted CI, including native development/production Chromium, provider verification and all generated-consumer install/removal lifecycles, before merge. Source CI success is not a combined-CI result.

## PWA / Offline acceptance

PWA / Offline is completed and reference-enabled: independent opt-in native injectManifest, exact three-file public allowlist, no data or SSR cache, natural-tab-close updates and SAME-URL two-phase retirement.

Source `52f6fcb2309daad9b1474a1c2c313914f3403460` passed all 28 jobs in [hosted CI](https://github.com/formless63/demo-starter-tanstack/actions/runs/37066322525), including real Chromium root/scoped workers, credential omission, privacy boundaries, natural multi-tab updates, actual generated Start production lifecycle, owned retirement and final source-removed HTTP rebuild. This documentation/catalog promotion requires its own complete exact-head CI before merge; source success is not a promotion-head CI claim.

### Identity policy Wave 2

Organizations → Authorization → Feature Flags are in-progress independent opt-in add-ons, deliberately enabled in the reference application. Isolated PostgreSQL/consumer lifecycles, scoped reference policies, browser/production checks and the generic hosted CI matrix remain required, with current integrated-tree acceptance pending and fault-injection fixtures paused. See their capability contracts and decision documents. Native Better Auth admission bounds are not serialized quotas, and its invitation claim/membership crash window is documented explicitly.
