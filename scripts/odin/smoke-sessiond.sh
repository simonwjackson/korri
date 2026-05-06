#!/usr/bin/env bash
# Smoke test the supervised Korri renderer session daemon on the Odin.

set -euo pipefail

ODIN_HOST="${ODIN_HOST:-root@sm8550}"
ODIN_PROJECT="${ODIN_PROJECT:-/storage/korri}"
KORRI_SESSIOND_URL="${KORRI_SESSIOND_URL:-http://127.0.0.1:3003}"

log()  { printf '\033[0;36m[sessiond-smoke]\033[0m %s\n' "$*"; }
fail() { printf '\033[0;31m[sessiond-smoke]\033[0m %s\n' "$*" >&2; exit 1; }

log "Checking korri-sessiond on $ODIN_HOST..."
ssh -o ConnectTimeout=5 -o BatchMode=yes "$ODIN_HOST" \
  "cd '$ODIN_PROJECT' && KORRI_SESSIOND_URL='$KORRI_SESSIOND_URL' /storage/bin/bun run tools/odin/sessiond-smoke.ts" \
  || fail "supervised Korri renderer session smoke failed"

log "sessiond smoke passed"
