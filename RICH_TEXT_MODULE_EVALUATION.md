# Rich Text / Tiptap v1 evaluation

## Decision and scope

Use matching stable `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit` 3.31.4 (npm registry dist-tag verification 2026-10-02). Official guidance: [React SSR installation](https://tiptap.dev/docs/editor/getting-started/install/nextjs), [editor configuration](https://tiptap.dev/docs/editor/getting-started/configure), [upstream releases](https://github.com/ueberdosis/tiptap/releases). React integration documents `immediatelyRender: false`; the public server-safe wrapper additionally defers importing editor code until mount. No unstable or paid extension is selected.

The frozen v1 contract is [CAPABILITY.md](capabilities/rich-text/CAPABILITY.md). Strict JSON, safe escaped rendering, constrained formatting, native history, explicit controlled acceptance/rejection and reset boundaries are the deliverables. Persistence/authorization remain application-owned. Plain-text clipboard and disabled drop avoid an HTML/asset ingestion surface. No capability hard dependency is introduced. Clean generated consumers remain opt-in.

## Verification ledger

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
