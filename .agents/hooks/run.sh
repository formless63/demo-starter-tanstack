#!/bin/sh
# Shared bootstrap only; all policy is in TypeScript. No tool input is evaluated.
set -eu
phase=$1
provider=$2
root=$3
if command -v bun >/dev/null 2>&1; then
  exec bun "$root/.agents/hooks/dispatch.ts" "$phase" "$provider"
fi
if command -v node >/dev/null 2>&1; then
  exec node "$root/.agents/hooks/dispatch.ts" "$phase" "$provider"
fi
printf '%s\n' '{"systemMessage":"Project hook unavailable: install Bun and rerun the repository checks manually."}'
