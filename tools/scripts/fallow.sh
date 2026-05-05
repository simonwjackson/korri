#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

if [[ "$(uname -s)" == "Linux" && -n "${KORRI_NIX_LD_INTERPRETER:-}" ]]; then
  case "$(uname -m)" in
    x86_64) fallow_target="linux-x64-gnu" ;;
    aarch64 | arm64) fallow_target="linux-arm64-gnu" ;;
    *) fallow_target="" ;;
  esac

  fallow_bin="$repo_root/node_modules/@fallow-cli/$fallow_target/fallow"
  if [[ -n "$fallow_target" && -x "$fallow_bin" ]]; then
    export LD_LIBRARY_PATH="${KORRI_NIX_LD_LIBRARY_PATH:-}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    exec "$KORRI_NIX_LD_INTERPRETER" "$fallow_bin" "$@"
  fi
fi

if [[ -x "$repo_root/node_modules/.bin/fallow" ]]; then
  exec "$repo_root/node_modules/.bin/fallow" "$@"
fi

exec bunx fallow "$@"
