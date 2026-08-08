#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bash git
set -euo pipefail
ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
export KORRI_ROOT="$ROOT"
exec nix develop "$ROOT#inputd" --command \
  bash "$ROOT/services/inputd/check-in-shell.sh" "$@"
