# Markdown / Code Content evaluation

2026-10-02: bounded v1 contract frozen in `capabilities/markdown-code/CAPABILITY.md` before implementation. No hard dependencies; default false. Catalog remains in-progress until complete exact-head CI.

Official sources: https://markdown-it.github.io/markdown-it/ and https://github.com/markdown-it/markdown-it ; https://shiki.style/guide/bundles and https://shiki.style/guide/best-performance . Current package registry stable versions are pinned rather than inferred from alpha TanStack packages. https://tanstack.com/highlight/latest explicitly labels Highlight alpha; https://tanstack.com/blog/introducing-tanstack-markdown-and-highlight describes both first alphas. Revisit after stable release and equivalent security/lifecycle proof.

Use markdown-it tokens rather than its HTML renderer. Use Shiki tokens, never its generated HTML; fixed fine-grained server imports keep grammars/engine out of client bundles. Whitelisted serializable nodes preserve SSR and hydration while React performs escaping. Images are alt text only to avoid implicit browser tracking. No server fetch of content links/images. Caller must authorize content before serialization.

Verification results will be recorded as checks finish; no browser or lifecycle success is implied by implementation alone.

## Local evidence (2026-10-02)

Registry queries verified `markdown-it` 15.0.2 and `shiki` 4.5.0. Frozen install, catalog/schema/add-on checks, root TypeScript, isolated authored-fixture TypeScript, lint (pre-existing warnings), 128 agent-harness tests and shipped parser/React SSR unit proofs passed. Source parity is asserted between installed reference files and authored assets; official CLI compilation regenerates the retained distributable.

Review identified and fixed two resource issues before publication: sparse Markdown tables can amplify a small input before a post-parse token check, so request-local block/inline State wrappers now reserve budget before allocation; inline-code text children are counted in the document budget. Regression cases cover both, plus individual/aggregate highlight budgets. Renderer tests also pass caller-forged unsafe tags, hrefs and token CSS through the actual shipped component and verify rejection.

The root Node production build and actual `/markdown-test` server-rendered response passed with native headings/code controls, escaped hostile HTML and alt-only images; no database connection was needed. Client output inspection found no Markdown-it/Shiki/Oniguruma/WASM payload from this capability. Its only new browser code is native React rendering and clipboard state, so no new Vite optimizer dependency is needed.

An uncommitted supplementary fixture used the official generated-consumer install, full TypeScript and unit checks, a real native Start module route build, the actual Node production request handler's SSR, production client-boundary scan, removal of runtime and test-only packages, then rebuild and typecheck. This passed. Browser commands were omitted only from that local fixture: the local Chromium executable is unavailable and this environment has a known OS-socket restriction. The committed lifecycle still requires actual Chromium SSR/hydration, clipboard success/failure/repetition, unmount and mounted replacement, theme switching, hostile content and no content-triggered requests; it does not skip a missing browser.

Full exact-head hosted CI, generated-consumer Chromium and reference development/production Playwright remain pending. Status and reference catalog enablement remain staged accordingly; local non-browser proof is not completion.

## CI runner-boundary correction

Initial head `5c13a1a` exposed two CI wiring errors: `.spec.ts` put the Playwright reference test into Bun's discovery while the repository's Playwright configuration selects `.e2e.ts`; generic installed-reference discovery also ran the Chromium fixture before CI provisioned Chromium. The successor renames the reference test to the established `.e2e.ts` convention and moves explicit `playwright install --with-deps chromium` ahead of `bun test`. Neither browser gate is removed. Two root regression tests protect discovery and provisioning order. Local Playwright listing selects the reference test, and Bun's full file-discovery pass selects only the two focused regression tests with no Playwright import error. Full hosted browser/exact-head acceptance remains required.

## Clipboard hydration readiness

Head `ac8378e` reached real Chromium but its first keyboard copy assertion observed blank status. The fixture waited for an SSR-visible heading, which does not establish React hydration readiness; its page/console errors were also retained until the final assertion, obscuring early failures. No clipboard rejection was reported. A local Node24/jsdom execution of the exact production client bundle exercised successful immediate and settled mouse copies, so this is not treated as a proven permission problem.

Copy controls now remain disabled in SSR until mount initialization completes, and both real-browser fixtures explicitly wait for enabled before Enter. Browser errors are emitted immediately. The real clipboard write/read and success/failure/stale-completion assertions remain in place. Two focused DOM regressions verify disabled pre-hydration controls, enabled post-hydration copy, repeated success, rejection, pending replacement and unmount. These pass alongside root/fixture typechecks and shipped parser/renderer/parity checks. Hosted browser confirmation remains required; DOM emulation is supplementary evidence.

The same successor also closes a defensive payload gap identified during Nuxt review. A framework-neutral normalizer now accepts unknown renderer documents and enforces finite shapes, aggregate text/code/node/depth budgets, known language labels and bounded highlighting before React allocation. Malformed highlights fall back to the exact code text; highlighted token text must round-trip exactly to clipboard text. Null roots, invalid nodes, forged code/line/span shapes, excessive arrays, multibyte text, deep/cyclic trees, styles and display/copy mismatches have focused regressions. The helper is aligned with Nuxt, including an element-depth off-by-one correction shared back to that implementation.

Final combined successor also passed the root production build and actual Node24 reference SSR with normalized highlighted output and copy controls disabled before hydration. Both real-browser gates remain pending on the new exact head.

## Original document clipboard identity

Independent review found that normalization creates fresh nodes while code text can remain identical across document replacement. Copy lifecycle invalidation now follows the original input document identity as well as code text, never the newly normalized object. Two deferred-promise DOM regressions cover resolve and reject after a structured-cloned same-code replacement: replacement clears feedback and enables a new copy, old completion cannot change the new pending status, and unrelated rerenders using the same original document preserve pending work. All four clipboard DOM tests, parser/renderer parity checks and root/asset typechecks pass. Hosted acceptance is still required for this successor.

## Parser-stable defensive HTML grammar

The shared normalizer now enforces flow/phrasing, list and table parent/child grammar, text-only inline code, void children and descendant anchor exclusion before traversal. This closes browser HTML-repair/hydration divergence for malformed persisted JSON. Ten React SSR→parsed DOM→hydrateRoot regressions cover nested paragraphs/headings/anchors, code blocks in paragraphs, table foster parenting, orphan structures, invalid list/phrasing children and void elements. They pass without recoverable hydration errors or invalid nesting diagnostics. Valid real parser output is preserved exactly by normalization. Authored and compiled add-on assets are synchronized; actual hosted browser/lifecycle acceptance remains pending.

## Standalone browser bundle environment correction

Head `3da8907` exposed the actual clipboard gate blocker once browser errors were logged: `(0, h.jsxDEV) is not a function`. The lifecycle runner supplies `NODE_ENV=test`, so Vite emitted development JSX calls while the fixture's define selected production React exports. This exact failure was reproduced locally by building the prior fixture under `NODE_ENV=test` and executing its compiled client in Node24/jsdom. The standalone build now temporarily aligns `NODE_ENV=production`, asserts Vite's production configuration, and restores the caller's environment in `finally`. The corrected compiled client hydrates without errors and successfully copies after readiness; pre-hydration activation remains disabled. Real hosted Chromium assertions, page-error collection and clipboard readback are unchanged and still required.

The same bounded grammar normalizer also rejects raw CR/NUL and unpaired UTF-16 surrogates before rendering text/code, including individual highlight spans. Eight additional SSR/hydration cases cover these browser/UTF-8 roundtrip hazards and valid paired emoji. Canonical parser CRLF/NUL handling and paired surrogates remain unchanged, verified by exact normalized-document equality.
