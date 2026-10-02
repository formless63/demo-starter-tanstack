# File UI v1 evaluation

Decision: framework-native React UI, native Start raw routes, explicit policy/atomic metadata/storage adapters. Only Object Storage is a hard capability. Prefer proxy upload for the enforceable default 10 MiB bound rather than presigned PUT's post-ingest limit. No Projects service copy or hidden Audit/Search/Notifications dependency.

Implemented evidence: eleven state-machine fault tests; actual AWS SDK/local S3 HTTP upload/HEAD/readback/replay/download/delete and reset-response late-writer quarantine with exactly one physical PUT on Bun and compiled Node24; PostgreSQL18 clean+upgrade, prior fourteen-entry/hash preservation, atomic reservation/CAS owner isolation, restart and retained receipts. Additive root migration index14 / SQL0016 / snapshot0014.

## Initial local evidence (historical, before source hosted acceptance)

Root typecheck, lint, governance and production build passed. Official generated-consumer install resolved only Object Storage, then typecheck, workflow tests, SDK protocol, shipped component SSR/browser bundle and clean build passed in a local partial fixture. Authored/compiled parity passed. Configured full root suite: 371 pass, 3 environmental failures (Docker-required Ops fixture; platform OTEL sampler affected two observability tests). Native HTTP dev+production fixture and root authenticated browser tests are wired into CI. Pending before promotion: canonical exact generated-consumer browser/provider/runtime/removal gates, native HTTP fixture, root full hosted verification and exact-head CI. Local Chromium/Nitro Unix sockets are restricted and Docker is unavailable, so hosted runs must establish those results. No production credentials or real user data used; no live AWS, antivirus, durable synthetic adapter or zero-orphan claim.

## Combined content-module acceptance

Both independently reviewed source heads passed full hosted CI: Rich Text `4754559bba71c36c357325f9b4d1231d3808d0cf` ([24 jobs](https://github.com/formless63/demo-starter-tanstack/actions/runs/37034217024)) and File UI `73c442b9b8729e17c8cb30a6879d87da80f31c5b` ([24 jobs](https://github.com/formless63/demo-starter-tanstack/actions/runs/37036091357)). This combined integration retains their accepted runtime and all inherited gates. The published combined head still requires its own complete hosted CI before merge; source success is not a combined-CI claim.

## Combined local composition verification

On the integration of main `7894d66` and both accepted source heads: frozen Bun install, root/Rich Text/Markdown TypeScript, lint (pre-existing warnings), capability/agent/project/theme governance, and root production Node/Nitro build passed. Focused tests passed: Rich Text 134, File UI 11, Command 12, Markdown DOM 23 plus parser/resource/SSR/parity suites, and Data Table 6. Actual File UI S3 SDK/local HTTP protocol passed under Bun and compiled Node. The semantic lock audit preserves all 1,019 main resolutions and adds exactly 45 Rich Text entries; File UI adds no runtime dependency. All fourteen prior migration entries/SQL/snapshot bytes are preserved, and File UI migration/journal/snapshot match the accepted source exactly.

Root/authored/compiled assets were synchronized and independently reviewed. Local Chromium, Docker/provider lifecycle, native Start HTTP and full database-backed verification are not claimed for this composition; their mandatory committed gates remain enabled for the combined published head's complete hosted CI. Accepted-source CI does not substitute for this final gate.
