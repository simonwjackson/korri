#!/usr/bin/env bash
set -euo pipefail

ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
REVIEW_ROOT="${1:-}"

if [[ "${KORRI_CONFIG_REVIEW_IN_SHELL:-}" != "1" ]]; then
  export KORRI_ROOT="$ROOT"
  export KORRI_CONFIG_REVIEW_IN_SHELL=1
  exec nix develop "$ROOT#korrid" --command "$0" "$@"
fi

if [[ -z "$REVIEW_ROOT" ]]; then
  REVIEW_ROOT="$(mktemp -d)"
  trap 'rm -rf "$REVIEW_ROOT"' EXIT
fi

exec cargo run --quiet \
  --manifest-path "$ROOT/services/korrid/Cargo.toml" \
  --bin config_snapshot_probe -- "$REVIEW_ROOT"
