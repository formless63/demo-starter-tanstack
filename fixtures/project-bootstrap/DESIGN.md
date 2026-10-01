# Field Notes design

Responsive existing app shell; one semantic theme with light/dark variants, default system and user selection. Review token contrast and keyboard focus in both variants. Use system fallbacks; imported font tokens alone do not supply font files. Initial documents included SPEC; onboarding added PROJECT and this DESIGN after review. Theme provenance is recorded in .project/theme.json.

Reviewed local `input/tweakcn-modern-minimal.json` is vendored as modern-minimal with light/dark variants. Inter, Source Serif 4 and JetBrains Mono tokens are retained as supplied family preferences; no font files or provider were approved. The approved font policy uses their sans-serif/serif/monospace system fallbacks until a separate explicit supply decision. Parsing does not establish accessible contrast.
