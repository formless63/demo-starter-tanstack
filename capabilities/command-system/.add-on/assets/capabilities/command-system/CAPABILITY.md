# Command System capability

Status: in-progress. `defaultInstalled: false`; reference integration is separate from clean-consumer installation.

This client-only add-on provides `CommandPalette` and the `AppCommand` contract. It uses `@tanstack/react-hotkeys@0.12.1` for cleanup-safe `Mod+K` registration and Base UI Dialog for focus, escape, modal, and portal behavior. Commands are caller-owned: navigation, authorization, search, and side effects stay in the consuming application.

The v1 palette supports deterministic filtering, grouping metadata, keyboard navigation, focus restoration, async pending/error states, and duplicate-execution protection. It has no database, migration, server process, environment variable, virtualization, or hard capability dependency.

Server rendering emits a closed/no-browser-dependent tree. Hotkeys and focus begin after mount; Base UI owns dialog focus management. The packaged test covers Mod+K, editable suppression, keyboard navigation, duplicate execution, and focus restoration; consumers must add interrupted async, unmount, and SSR/hydration cases for their command adapters.

Removal deletes only installed UI assets and dependency entries. It does not delete application data, routes, or migration history. The add-on source and compiled distributable remain retained in this repository.
