#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bash git
# THROWAWAY PROTOTYPE entrypoint. Runs the pinned flake devshell below.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
exec nix develop "$ROOT#korrid-spike" --command \
  "$ROOT/services/korrid-spike/run-in-shell.sh" "$@"
