#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
node_roots=("$repo_root")

# Git worktrees do not always have their own node_modules. When this repo is
# checked out under the project's conventional .worktrees/ directory, fall back
# to the main checkout's dependencies before falling back to bunx.
case "$repo_root" in
  */.worktrees/*) node_roots+=("${repo_root%%/.worktrees/*}") ;;
esac

if [[ "$(uname -s)" == "Linux" && -n "${KORRI_NIX_LD_INTERPRETER:-}" ]]; then
  case "$(uname -m)" in
    x86_64) fallow_target="linux-x64-gnu" ;;
    aarch64 | arm64) fallow_target="linux-arm64-gnu" ;;
    *) fallow_target="" ;;
  esac

  for node_root in "${node_roots[@]}"; do
    fallow_bin="$node_root/node_modules/@fallow-cli/$fallow_target/fallow"
    if [[ -n "$fallow_target" && -x "$fallow_bin" ]]; then
      export LD_LIBRARY_PATH="${KORRI_NIX_LD_LIBRARY_PATH:-}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
      exec "$KORRI_NIX_LD_INTERPRETER" "$fallow_bin" "$@"
    fi
  done
fi

for node_root in "${node_roots[@]}"; do
  if [[ -x "$node_root/node_modules/.bin/fallow" ]]; then
    exec "$node_root/node_modules/.bin/fallow" "$@"
  fi
done

exec bunx fallow "$@"
