# Shared project hooks

`run.sh` selects Bun (or Node 24 fallback). `dispatch.ts` accepts JSON on stdin and converts provider-neutral decisions into client responses. The root comes from the installed script location, not untrusted payload data. `session-context.ts`, `tool-guard.ts` and `quality-gate.ts` hold the shared policy. No shell input is evaluated and no transcript or environment is printed.

Project JSON adapters invoke the same launcher with `session`, `guard` or `quality` and `claude`, `codex` or `gemini`. See [agent automation](../../docs/AGENT-AUTOMATION.md) for trust, limitations and controls. Tests live in `scripts/agent-hooks.test.ts` so the ordinary Vitest suite discovers them.
