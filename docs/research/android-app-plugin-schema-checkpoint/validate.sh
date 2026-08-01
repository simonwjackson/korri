#!/usr/bin/env bash
set -euo pipefail

FIXTURE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$FIXTURE" rev-parse --show-toplevel)"
PRODUCTION_PLUGIN="$ROOT/services/korrid/plugins/android-app.plugin.ts"
LEGACY_REV="0e4cec9da3d77e6578b8a01a5d83420ba0d98e62"
TEMP="$(mktemp -d "${TMPDIR:-/tmp}/korri-android-schema-checkpoint.XXXXXX")"
trap 'rm -rf "$TEMP"' EXIT

git -C "$ROOT" cat-file -e "$LEGACY_REV^{commit}"
cmp "$FIXTURE/android-app.plugin.ts" "$PRODUCTION_PLUGIN"
echo "production plugin parity: PASS"
git -C "$ROOT" archive "$LEGACY_REV" | tar -x -C "$TEMP"
cp "$FIXTURE/validate-legacy.ts" "$TEMP/checkpoint0-validate.ts"

nix develop "path:$ROOT#korrid" -c \
  cargo run --quiet \
    --manifest-path "$ROOT/services/korrid/Cargo.toml" \
    --bin script_probe -- \
    "$PRODUCTION_PLUGIN" \
  | sed -n 's/^declaration: //p' > "$TEMP/declaration.json"

test -s "$TEMP/declaration.json"

# Inner bash expands its positional parameters, not this parent shell.
# shellcheck disable=SC2016
nix develop "path:$ROOT#portal" -c bash -euo pipefail -c '
  cd "$1"
  bun install --frozen-lockfile --ignore-scripts >/dev/null
  bun checkpoint0-validate.ts "$2"
' bash "$TEMP" "$FIXTURE"
