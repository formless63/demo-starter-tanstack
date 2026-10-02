# Markdown / Code Content v1

Status: done; enabled in the root reference application. Opt-in (`defaultInstalled: false`), no hard capability dependencies.

## Frozen boundary

Server-only `parseMarkdown` accepts Markdown source and returns a serializable, whitelisted document tree. `MarkdownContent` renders that tree with native React elements, accessible SSR code blocks and client clipboard feedback. Parsing/highlighting never occurs in the browser. Application server functions own authorization, fetching and caching; this module has no app aliases, auth, DB, storage, AI or service dependency.

Stable markdown-it 15.0.2 with HTML, linkify and typographer explicitly disabled; Shiki 4.5.0 core with fixed TypeScript/JavaScript/JSON grammars and github-light/github-dark themes. TanStack Markdown/Highlight remain alpha and are excluded. No raw HTML, MDX, arbitrary plugins, custom grammar/theme loading, code execution, network fetching, or image loading. Images render their alt text only. Unknown languages and over-budget highlighting become escaped plaintext. Fence metadata is not interpreted.

- At most 65,536 UTF-8 input bytes and 4,096 parser-token allocations/document nodes, nesting 24, code blocks 32 and aggregate code 32,768 characters. Invalid/over-budget input throws `MarkdownLimitError` without retaining/logging source. A request-local budget is enforced before each block/inline token allocation, including sparse table expansion, then checked again during tree conversion. Markdown-it stops nested parsing at 24; unsupported syntax remains text.
- Highlight at most 16,384 characters/document, 8,192/block, 128 lines/block, 512 characters/line and 8,192 resulting highlight spans/document. This bounds work, not a wall-clock deadline. No claim of safe arbitrary grammar execution.
- Links allow HTTPS without credentials, simple mailto addresses, root-relative paths (never `//`) and fragments. Controls, backslashes and all other schemes are refused. No target blank, automatic linkification or heading IDs. Relative `./`/`../` paths are intentionally plaintext links.
- Supported CommonMark blocks/inlines plus markdown-it tables and strikethrough; no task-checkbox plugin, math, embedded media, footnotes or editor. HTML is visible escaped text. Whitelisted tags and attributes only; no DOM IDs, event handlers or arbitrary styles from content. The React renderer independently rechecks link schemes and permits only hex syntax-token colors, even for a caller-constructed document.
- Copy buttons use the parsed code text (Markdown normalizes CRLF to LF), preserve trailing newline, report success/failure through a polite status and discard stale/unmounted completions. Replacement of the original document invalidates pending copies even when code text is unchanged; unrelated rerenders of the same original document preserve them. Copy controls are disabled in SSR until their hydration mount effect completes, so keyboard activation cannot race missing event handlers or initialization. Clipboard access occurs only on a user click. Code remains selectable when clipboard is unavailable.

## Theme and application use

Import `markdown-code.css` alongside the component. Surrounding layout consumes the existing semantic background/foreground/border/muted tokens; fixed high-contrast GitHub syntax token colors switch via ancestor `.dark`. The application owns its existing persisted/system theme state; server output is identical across modes. There is no global typography reset or remote font.

Call `parseMarkdown` from a TanStack server function/loader server boundary, then pass its result to `MarkdownContent`. Never import `markdown.server.ts` into client code. The browser receives content; authorization must happen before returning private content. The renderer accepts unknown persisted/input documents through a closed normalizer: malformed roots become empty documents, unsupported/malformed nodes are omitted, and node/depth/text/code budgets are rechecked before allocating output. Malformed or over-budget highlighted lines become plaintext; valid highlighted text must exactly equal copied code. A bounded HTML content grammar rejects invalid parent/child subtrees (including nested paragraphs/anchors, orphan list/table nodes and code blocks inside phrasing), preventing browser parser repairs from breaking hydration. It never becomes an arbitrary tag/attribute renderer.

## Install and remove

Use official TanStack add-on compilation/installation through the catalog. Generated consumers receive the integration, documentation and explicit verification scripts only; no automatic route, database migration, environment variable or runtime service is installed.

Application removal: remove component/CSS/server imports and application routes first, then `src/integrations/markdown-code`, module fixture scripts and `markdown-it`/`shiki` packages if unused elsewhere. Delete corresponding package scripts; regenerate routes, typecheck and build. Keep authored `capabilities/markdown-code` source if future reinstallation is desired; it is separate from runtime installation. No stored data is deleted. The generated fixture exercises this sequence, including rebuild.

Reference application: `/markdown-test` uses a server function and the installed boundary, with SSR/hydration/hostile input/copy/theme verification. Catalog reference enablement is added only after proof; completion remains gated on exact-head full CI.

## Acceptance evidence

Runtime head `a591a9f0281e925adddcfda5f571ae8d1e4dfc2b` passed full [hosted CI](https://github.com/formless63/demo-starter-tanstack/actions/runs/37025808307): generated consumer install/typecheck/build, real Chromium hydration and clipboard, client-boundary inspection, removal/rebuild, root reference development/production browser gates, and 23 DOM boundary/lifecycle regressions. The completion metadata successor requires its own exact-head CI before merge.

Callers loading persisted or constructed JSON should run the exported `normalizeMarkdownDocument` before SSR transport and pass that same canonical document to server and client. The component independently revalidates input; custom serializers must preserve strings across UTF-8 transport.
