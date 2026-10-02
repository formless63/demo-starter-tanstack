# Rich Text / Tiptap v1 evaluation

## Decision and scope

Use matching stable `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit` 3.31.4 (npm registry dist-tag verification 2026-10-02). Official guidance: [React SSR installation](https://tiptap.dev/docs/editor/getting-started/install/nextjs), [editor configuration](https://tiptap.dev/docs/editor/getting-started/configure), [upstream releases](https://github.com/ueberdosis/tiptap/releases). React integration documents `immediatelyRender: false`; the public server-safe wrapper additionally defers importing editor code until mount. No unstable or paid extension is selected.

The frozen v1 contract is [CAPABILITY.md](capabilities/rich-text/CAPABILITY.md). Strict JSON, safe escaped rendering, constrained formatting, native history, explicit controlled acceptance/rejection and reset boundaries are the deliverables. Persistence/authorization remain application-owned. Plain-text clipboard and disabled drop avoid an HTML/asset ingestion surface. No capability hard dependency is introduced. Clean generated consumers remain opt-in.

## Initial verification ledger (historical, before source hosted acceptance)

Implementation is in-progress. Required gates: source/distributable parity; malicious and oversized document tests; actual editor controlled/rejected changes and replacement/undo tests; SSR/hydration; accessible browser interactions on generated consumer and native reference route; independent install/typecheck/build/removal/rebuild; governance and full exact-head hosted CI. Local policy blocks Chromium/Nitro Unix sockets; no restriction bypass is attempted and no browser acceptance is claimed from DOM substitutes. Published CI evidence will be recorded before metadata promotion.

## Initial local results (before hosted correction)

- 113 focused tests passed: strict schema and hostile input; actual Tiptap transactions; controlled accept/reject; external replacement and undo/redo privacy; all formatting/link controls; whole-document selection; canonical adjacent text/mark normalization; literal/empty clipboard; failed lazy loading; actual SSR/hydration and runtime asset parity.
- Root and authored TypeScript, governance and agent guidance checks passed. Root Biome passes with pre-existing warnings.
- Root production Node/Nitro build passed before the final two explicit whitespace style additions; the final-tree production build is pending the mandatory hosted gate. The SSR route's client loader is replaced by TanStack's server-only guard, and its safe fallback renders without loading browser editor execution.
- Independent official CLI consumer installation, TypeScript, production client/SSR build, removal and lean rebuild passed. This local-only fixture excluded Chromium because of the OS socket restriction; the committed acceptance fixture requires it.
- Full root test attempt is not a pass: absent PostgreSQL and existing Bun-specific subprocesses launched through Node prevent the baseline integration suite here. Complete hosted CI remains required.

Whole-document blockquote selection and adjacent-text normalization were found by actual-editor tests and corrected before publication. Callback handling, plain-text-only clipboard, strict links and history reset boundaries remain the frozen v1 scope.

Final test discovery is verified: Playwright lists `rich-text.e2e.ts`, Bun does not discover it, and CI installs Chromium before generic reference tests. A later root typecheck attempt during another build was OOM-killed; earlier root/authored typechecks passed, and final exact-head typecheck/build remain mandatory in hosted CI.

## Hosted hydration correction

The first hosted generated-consumer browser run on `ab3f583` completed all editor interaction assertions but correctly failed the preserved console-error gate with React #418. The standalone HTML response omitted an encoding declaration; real HTML byte decoding interpreted the UTF-8 ellipsis in “Loading editor…” as windows-1252 “Loading editorâ€¦”. This is independent of JSX development/production runtime selection. The fixture now declares UTF-8 in both HTTP Content-Type and an early meta charset, with a shared shipped HTML helper. A permanent regression compiles the actual shipped SSR and minified production client, hydrates both the header and meta-declared UTF-8 byte paths with no errors, and demonstrates #418 if both declarations are removed. The same module/loading/editor code is exercised. The root-focused suite now has 114 passing tests; hosted Chromium remains required and its error assertion is unchanged.

On the UTF-8 correction, root/authored typechecks, the root production Node/Nitro build, and independent consumer installation/typecheck/build/removal/rebuild all passed locally. The byte-level regression and 114-test suite passed. These checks do not replace the mandatory hosted Chromium/full-CI gates.

## Shared Unicode and identity privacy corrections

Independent review of the sibling implementation found two shared contract gaps before acceptance. The framework-neutral parser now canonicalizes CRLF/CR to LF and rejects NUL or unpaired surrogates in text and links, preserving valid Unicode and literal U+FFFD. Clipboard input is normalized before insertion; low-level noncanonical-CR/invalid-scalar transactions are rejected so history cannot retain them. A separately compiled UTF-8 SSR byte stream is parsed as HTML and hydrated with the actual client/editor, proving canonical line endings and Unicode survive without browser-error suppression.

The in-progress v1 editor now requires a nonempty caller-owned `documentKey`. Stable identity preserves ordinary accepted or cloned echoes and native undo. Switching the key destroys the old client/history even for identical JSON; missing identity fails closed. Regression coverage edits PRIVATE to Public, switches to a different Public record with equal content, then tries undo/redo and a late update on the retired editor. React layout cleanup disables retired callbacks synchronously, before Tiptap's delayed destruction, so no stale instance can update the new record. Applications must change the key when switching records or intentionally resetting a session; no caller-object identity heuristic is used.

The expanded focused suite has 134 passing tests, with source/authored parity. Final local root/authored typechecks, root production build and independent consumer install/typecheck/build/removal/rebuild passed for these source/API changes. Local browser execution remains OS-blocked; exact-head hosted Chromium/full CI and independent re-review remain mandatory.

## Current-main integration

Merged main `7894d66` (completed Markdown / Code capability) without changing Rich Text source behavior or its in-progress/default-off status. Shared docs/catalog/routes/dependencies retain both capabilities; CI preserves Markdown gates and Chromium-before-reference ordering plus Rich Text gates. All 1,019 existing main lock entries are unchanged, none removed; only 45 Tiptap/transitive entries were added. Combined frozen install, Rich Text 134, Command 12, Markdown unit and Markdown DOM 23 checks passed. Combined local root/Rich Text/Markdown typechecks and the production build subsequently passed before publication, including the native Start-generated route registration. Full exact-head hosted CI remains mandatory; prior individual checks do not substitute for this combined acceptance gate.

## Combined content-module acceptance

Both independently reviewed source heads passed full hosted CI: Rich Text `4754559bba71c36c357325f9b4d1231d3808d0cf` ([24 jobs](https://github.com/formless63/demo-starter-tanstack/actions/runs/37034217024)) and File UI `73c442b9b8729e17c8cb30a6879d87da80f31c5b` ([24 jobs](https://github.com/formless63/demo-starter-tanstack/actions/runs/37036091357)). This combined integration retains their accepted runtime and all inherited gates. The published combined head still requires its own complete hosted CI before merge; source success is not a combined-CI claim.

## Combined local composition verification

On the integration of main `7894d66` and both accepted source heads: frozen Bun install, root/Rich Text/Markdown TypeScript, lint (pre-existing warnings), capability/agent/project/theme governance, and root production Node/Nitro build passed. Focused tests passed: Rich Text 134, File UI 11, Command 12, Markdown DOM 23 plus parser/resource/SSR/parity suites, and Data Table 6. Actual File UI S3 SDK/local HTTP protocol passed under Bun and compiled Node. The semantic lock audit preserves all 1,019 main resolutions and adds exactly 45 Rich Text entries; File UI adds no runtime dependency. All fourteen prior migration entries/SQL/snapshot bytes are preserved, and File UI migration/journal/snapshot match the accepted source exactly.

Root/authored/compiled assets were synchronized and independently reviewed. Local Chromium, Docker/provider lifecycle, native Start HTTP and full database-backed verification are not claimed for this composition; their mandatory committed gates remain enabled for the combined published head's complete hosted CI. Accepted-source CI does not substitute for this final gate.
