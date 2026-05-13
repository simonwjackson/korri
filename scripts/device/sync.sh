#!/usr/bin/env bash
# Incremental rsync of the project to the Device. Used by `just sync-device`
# and called internally by `just dev-device` on each iteration.
#
# Excludes node_modules (must stay aarch64-native on the device), build
# outputs, worktrees, the developer's .env, Korri-owned device media, and
# VCS metadata.

set -euo pipefail

DEVICE_HOST="${DEVICE_HOST:-root@sm8550}"
DEVICE_APP_ROOT="${DEVICE_APP_ROOT:-/storage/.guest/korri/app}"

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

read -r -a SSH_EXTRA_OPTS <<< "${DEVICE_SSH_OPTS:-}"
RSYNC_SSH=(ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new "${SSH_EXTRA_OPTS[@]}")

rsync -az --delete \
  -e "${RSYNC_SSH[*]}" \
  --exclude=node_modules \
  --exclude=out \
  --exclude=.worktrees \
  --exclude=.direnv \
  --exclude=.tanstack \
  --exclude=.git \
  --exclude=.nix-bin \
  --exclude=.env \
  --exclude=sessiond.token \
  --exclude=media \
  "$REPO_ROOT/" "$DEVICE_HOST:$DEVICE_APP_ROOT/"
