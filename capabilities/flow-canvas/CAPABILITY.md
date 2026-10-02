# Flow / Canvas v1

Status: completed and reference-enabled; defaultInstalled false. No hard capability dependencies. Optional Realtime, Object Storage and Audit Log integration remains application-owned.

## Frozen contract (2026-10-02)

Pinned native @xyflow/react 12.12.0 provides a client-only visual enhancement over a deterministic semantic SSR graph and persistent keyboard form controls. The application owns graph value and persistence. The module emits proposals, never claims a save, never executes graph nodes and does not provide layout, collaboration, autosave, network, localStorage or database storage.

GraphDocument JSON v1 has schemaVersion 1, nodes (id, kind default, position x/y, plain-text label), edges (id, source, target, sourceHandle out, targetHandle in, optional plain-text label), and optional viewport x/y/zoom. Input is bounded to 1 MiB UTF-8, 500 nodes, 1000 edges, 128-character IDs, 1000-character labels, coordinates ±1e6 and zoom 0.1–4. All shapes are closed: reject duplicate node/edge IDs, dangling references, duplicate directed endpoint pairs, self connections, unsupported handles/kinds, prototype keys, unknown executable/style/URL fields atomically. Cycles are allowed. A pure caller connection predicate may restrict proposals. Node deletion removes incident edges atomically.

Text must contain no CR, NUL or lone UTF-16 surrogate. Reject rather than silently alter imported input; valid paired Unicode survives unchanged. Validate before SSR transport, and serialize with HTML-safe JSON escaping. The React component independently validates. No renderer is selected or executed from imported data; v1 ships one fixed plain-text node renderer.

The controlled value is authoritative, including parent rejection. No optimistic document store. Each editor has its own vendor provider; explicit documentKey remounts transient state and invalidates stale callbacks on record switches. Read-only suppresses all document mutations, while selection/navigation remain available. Selection is transient. Pointer drag, pan, zoom and fit have equivalent semantic controls for add/connect/rename/delete/position and viewport. Escape clears selection and cancels an in-flight gesture; no global keyboard handlers or shortcuts in editable inputs. Reduced-motion users receive instant viewport changes. Vendor keyboard support supplements rather than replaces semantic controls.

## Persistence and reference

The public synthetic /flow-test application owns an injected async persistence fixture. Only one save is outstanding. Request identity, document generation and edit revision prevent stale save/load completion from replacing a newer record or edit; failures retain dirty state; cancel/unmount invalidate completions. The module has no persistence API.

## Installation, removal and acceptance

Official TanStack add-on source and compiled assets install integration helpers, native React components, CSS, this contract and explicit fixtures. No route is automatically installed. No environment variables, migrations or runtime services. Remove application imports/routes, integration and fixture scripts, then @xyflow/react if unused; retain application-owned stored graph data. Remove scoped Vite optimizeDeps entries only when no remaining consumer needs them. Rebuild and typecheck after removal. Retaining reusable capability source does not retain runtime dependencies.

Completion requires authored/compiled/installed parity, graph security and SSR proofs, controlled rejection/identity/interruption coverage, two independent editors, clean generated install/typecheck/build and removal/rebuild, real hosted Chromium and exact-head full CI plus independent review. Local DOM tests never replace hosted browser gates.

Native adapter IDs are deterministic ASCII encodings of validated domain IDs, preventing vendor selector interpolation hazards. Callback proposals preserve original IDs exactly.

## Acceptance evidence

Flow / Canvas source `a1a020cf7e75340e4f833c62db0d0b0e6b38d117` passed all 26 hosted jobs ([run 37051676575](https://github.com/formless63/demo-starter-tanstack/actions/runs/37051676575)); Internationalization source `d422d4b24d9ea4a5904870564041465d8e050ef2` passed all 26 hosted jobs ([run 37052978536](https://github.com/formless63/demo-starter-tanstack/actions/runs/37052978536)). Both sources and their composition were independently reviewed. The combined integration preserves accepted main ancestry, both exact source parents, runtime source bytes, authored/compiled parity, migrations and all inherited gates. There are now twenty-five completed, reference-enabled capabilities; every generated-consumer default remains false. The new combined head still requires its own complete hosted CI, including native development/production Chromium, provider verification and all generated-consumer install/removal lifecycles, before merge. Source CI success is not a combined-CI result.
