#!/usr/bin/env bash
set -euo pipefail

ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
PLUGIN="${1:-$ROOT/services/korrid/plugins/android-app.plugin.ts}"

if [[ "${KORRI_PLUGIN_REVIEW_IN_SHELL:-}" != "1" ]]; then
  export KORRI_ROOT="$ROOT"
  export KORRI_PLUGIN_REVIEW_IN_SHELL=1
  exec nix develop "$ROOT#korrid" --command "$0" "$@"
fi

exec cargo run --quiet \
  --manifest-path "$ROOT/services/korrid/Cargo.toml" \
  --bin plugin_registry_probe -- "$PLUGIN" --review
