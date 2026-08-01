#!/usr/bin/env bash
set -euo pipefail

ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
REVIEW_ROOT="${1:-}"

if [[ "${KORRI_PLUGIN_ROUTE_REVIEW_IN_SHELL:-}" != "1" ]]; then
  export KORRI_ROOT="$ROOT"
  export KORRI_PLUGIN_ROUTE_REVIEW_IN_SHELL=1
  exec nix develop "$ROOT#korrid" --command "$0" "$@"
fi

if [[ -z "$REVIEW_ROOT" ]]; then
  REVIEW_ROOT="$(mktemp -d)"
  trap 'rm -rf "$REVIEW_ROOT"' EXIT
  cp "$ROOT/docs/research/android-app-plugin-schema-checkpoint/config.yaml" \
    "$REVIEW_ROOT/config.yaml"
  cp "$ROOT/docs/research/android-app-plugin-schema-checkpoint/library.yaml" \
    "$REVIEW_ROOT/library.yaml"
fi

exec cargo run --quiet \
  --manifest-path "$ROOT/services/korrid/Cargo.toml" \
  --bin plugin_route_probe -- "$REVIEW_ROOT" --review
