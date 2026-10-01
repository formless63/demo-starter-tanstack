# Project onboarding

Ask your coding agent to **onboard this project**, or use `.agents/prompts/onboard-project.md`. The canonical procedure is `.agents/skills/project-onboarding/SKILL.md`. This is an agent-led review, not a terminal questionnaire. Supply existing requirements, design artifacts and skills first; the agent inventories them, explains inferred decisions and interviews only gaps in small rounds.

Review the concrete document edits, capability plan, theme/mode/font choices, and incoming skill classifications before approving customization. Good existing documents retain their names. Templates under `docs/templates/project/` cover concise PROJECT, behavioral SPEC and DESIGN; `.project/sources.json` links decisions to repository files, public URLs or supplied materials. Source manifests provide traceability, not synchronization.

## Version-1 portable contract

Configured consumers commit `.project/config.json`, `sources.json`, `skills.json`, and `theme.json`. JSON schemas under `.agents/schemas/` describe the same framework-neutral contract for TanStack and Nuxt. `scripts/lib/project-contracts.ts` defines checked-in schema generation; `project:check` detects schema drift as well as semantic errors. Framework-specific code stays outside the profile. Changes to this contract require explicit version/migration review. One named theme supports future named presets without runtime marketplace behavior.

Config contains name/summary, nullable relative document paths, selected/deferred/excluded capability IDs, supported light/dark modes, default light/dark/system, user selection, theme source/name/reference/file, optional font supply decision, and canonical skill manifest path. The catalog remains authoritative: selected IDs must be done and include all hard requirements. Planned capabilities can be deferred; onboarding never builds a substitute. Distinguish optional recommendations from required selection.

Sources entries have `id`, `type`, `title` and appropriate `path`, public `url`, or portable material `reference`. Types are repository-file, public-url, external-material, design-document, migration-source. Repository paths must exist and resolve inside the repository. Public URLs use HTTPS without credentials, queries or fragments; do not store private/signed URLs. External material references are portable labels/relative paths, never absolute machine paths. Inspect free-text notes before committing; validators cannot infer every secret.

Skills entries contain name, source ID, classification, decision (accepted/adapted/rejected/deferred), approved boolean, nullable installedPath and review notes. Accepted/adapted entries require explicit approval, compatible/project-specific or adaptation review, and existing `.agents/skills/<name>/SKILL.md`. Conflict/unsafe/redundant/irrelevant entries cannot be installed. No client-specific copied skill trees and no implicit imports of hooks, MCP, permissions or agent settings.

## Deterministic commands

`bun run project:check` is fast and makes no network calls. Without a profile it succeeds while checking bootstrap schemas/templates/tooling. With one it validates all manifests, files, provenance, capability closure, skills and coherent appearance. `bun run project:status` gives a concise read-only summary and compares selection with catalog application enablement; drift is a warning, not automatic installation. Capability tooling still owns governance.

The existing SessionStart adds at most three short profile lines when configured. Stop/AfterAgent validates changed bootstrap surfaces without Docker/network/full tests. No profile means no onboarding nag.

Manual onboarding is supported: copy relevant templates, fill approved metadata using the schemas, use existing capability installation/removal conventions and appearance tooling, then run the same verification. The reference repository intentionally has no real downstream profile. A deterministic hypothetical consumer fixture covers existing SPEC, new PROJECT, selected/deferred capabilities and reviewed skill outcomes.
