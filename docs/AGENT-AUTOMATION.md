# Project agent automation

`AGENTS.md` is canonical guidance and `.agents/skills` is the canonical skill tree. `CLAUDE.md` and `.claude/skills` remain symlinks. Claude and Gemini project settings are thin adapters; `.codex/hooks.json` contains only Codex project runtime hooks. Policy lives once in `.agents/hooks` and requires Bun (Node 24 can run the shared scripts if Bun is unavailable; capability checks still require Bun).

Project hooks execute local code with your privileges. Inspect the settings, shared launcher and scripts before granting normal client project/hook trust, including after updates. Never bypass hook trust in normal use. These guards supplement each client's sandbox and approvals; they never auto-approve tools.

## Automatic behavior

- Session start/resume: repository/framework, Git branch, clean/dirty state, a bounded capability status summary and the matching-skill reminder. Claude/Codex also reinject after compaction. Gemini exposes startup/resume/clear, with no after-compaction event.
- Before shell/edit tools: block hard resets, forced Git cleans/pushes, recursive removal of the repository root or `.git`, and direct secret `.env` edits. `.env.example`/`.env.sample` are allowed. Ordinary generated-file and disposable-fixture cleanup remains allowed. Complex shell syntax or unknown payloads fail open with a warning; this is a small footgun guard, not a shell security boundary.
- Completion: clean worktrees return immediately. Dirty worktrees run staged and unstaged `git diff --check`; changed capability/governance paths run `bun run capabilities:check`, and changed agent-harness paths run `bun run agents:check`. Overlapping paths run both. Failures request correction/retry through the client's supported response. Hooks do not skip a failing check merely because a retry is active, and have bounded command timeouts. They return only check names, never captured command output or environment values.

No per-edit formatting, prompt/tool telemetry, Git hooks, daemons, credentials or automatic service startup. Full lint/typecheck/tests, browser tests, clean add-on install/removal, S3 compatibility and production containers remain task/skill/CI responsibilities.

## Inspect or disable

- **Codex:** `/hooks` lists sources, reviews/trusts changed hooks and disables individual non-managed hooks. Project `.codex` config must be trusted. This project uses the documented JSON representation, so no duplicate `config.toml` is needed. Commands resolve scripts with `git rev-parse --show-toplevel`, including when launched from a subdirectory.
- **Claude Code:** `/hooks` inspects configured hooks. Disable all locally with `claude --settings '{"disableAllHooks":true}'`, or set `disableAllHooks` in ignored `.claude/settings.local.json`. Project commands use `$CLAUDE_PROJECT_DIR`.
- **Gemini CLI:** `/hooks panel` inspects hooks; `/hooks disable <name>` disables one and `/hooks disable-all` disables all (`enable`/`enable-all` restore them). Review project hook fingerprint changes through normal trust controls. Commands use `$GEMINI_PROJECT_DIR`; `context.fileName` remains `AGENTS.md`.

Run `bun run agents:check` to validate the harness, including the required `.agents/prompts` directory, without agent executables. Run `bun run agents:test` for synthetic payloads and disposable Git fixtures. No destructive guard command is executed by the tests.

Schemas and event semantics were checked on 2026-09-30 against current official references: [Codex hooks](https://developers.openai.com/codex/hooks), [Claude hooks](https://code.claude.com/docs/en/hooks), [Gemini hooks](https://geminicli.com/docs/hooks/) and [Gemini event reference](https://geminicli.com/docs/hooks/reference/). Gemini timeouts use milliseconds; Claude/Codex use seconds. Older clients lacking these events must be upgraded or have project hooks disabled through normal controls.
