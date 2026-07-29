#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bash git
# Korrid full check. Runs the pinned flake devshell below.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
exec nix develop "$ROOT#korrid" --command \
  "$ROOT/services/korrid/check-in-shell.sh" "$@"
