#!/usr/bin/env bash
# Incremental rsync of the project to the Odin. Used by `just sync-odin`
# and called internally by `just dev-odin` on each iteration.
#
# Excludes node_modules (must stay aarch64-native on the device), build
# outputs, worktrees, the developer's .env, Korri-owned device media, and
# VCS metadata.

set -euo pipefail

ODIN_HOST="${ODIN_HOST:-root@sm8550}"
ODIN_PROJECT="${ODIN_PROJECT:-/storage/korri}"

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

rsync -az --delete \
  --exclude=node_modules \
  --exclude=out \
  --exclude=.worktrees \
  --exclude=.direnv \
  --exclude=.tanstack \
  --exclude=.git \
  --exclude=.nix-bin \
  --exclude=.env \
  --exclude=media \
  "$REPO_ROOT/" "$ODIN_HOST:$ODIN_PROJECT/"
