#!/usr/bin/env bash
# Check whether the Odin can host the Korri Electrobun Layer 8 renderer path.
# This is read-only on the device: it gathers facts over SSH and lets the
# TypeScript classifier decide whether launch/build work should proceed.

set -euo pipefail

ODIN_HOST="${ODIN_HOST:-root@thor}"
ODIN_PROJECT="${ODIN_PROJECT:-/storage/korri}"
KORRI_ELECTROBUN_APP="${KORRI_ELECTROBUN_APP:-}"
KORRI_ELECTROBUN_STATE_ROOT="${KORRI_ELECTROBUN_STATE_ROOT:-/storage/.local/share/nix-apps/korri-electrobun}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

read -r -a SSH_EXTRA_OPTS <<< "${ODIN_SSH_OPTS:-}"

ssh_odin() {
  ssh \
    -o ConnectTimeout=5 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    "${SSH_EXTRA_OPTS[@]}" \
    "$ODIN_HOST" "$@"
}

facts="$(
  if ssh_odin "ODIN_PROJECT='$ODIN_PROJECT' KORRI_ELECTROBUN_APP='$KORRI_ELECTROBUN_APP' KORRI_ELECTROBUN_STATE_ROOT='$KORRI_ELECTROBUN_STATE_ROOT' bash -s" <<'REMOTE'
set -euo pipefail

yes_no_path() {
  if [ -e "$1" ]; then printf 'yes'; else printf 'no'; fi
}

yes_no_exec() {
  if [ -x "$1" ]; then printf 'yes'; else printf 'no'; fi
}

yes_no_command() {
  if command -v "$1" >/dev/null 2>&1; then printf 'yes'; else printf 'no'; fi
}

yes_no_service_active() {
  if systemctl is-active --quiet "$1" 2>/dev/null; then printf 'yes'; else printf 'no'; fi
}

resolve_app() {
  if [ -n "${KORRI_ELECTROBUN_APP:-}" ]; then
    command -v "$KORRI_ELECTROBUN_APP" 2>/dev/null || printf '%s' "$KORRI_ELECTROBUN_APP"
    return
  fi

  command -v korri-desktop-odin 2>/dev/null || command -v korri-desktop 2>/dev/null || true
}

classify_app_origin() {
  path="$1"
  if [ -z "$path" ]; then
    printf 'missing'
    return
  fi

  resolved="$(readlink -f "$path" 2>/dev/null || printf '%s' "$path")"
  case "$resolved" in
    /nix/store/*|/storage/.nix-profile/*) printf 'nix' ;;
    *) printf 'non-nix' ;;
  esac
}

state_root_writable() {
  root="$1"
  if [ -d "$root" ]; then
    [ -w "$root" ] && printf 'yes' || printf 'no'
    return
  fi

  parent="$(dirname "$root")"
  if [ -d "$parent" ]; then
    [ -w "$parent" ] && printf 'yes' || printf 'no'
    return
  fi

  [ -w /storage ] && printf 'yes' || printf 'no'
}

app_path="$(resolve_app)"
app_origin="$(classify_app_origin "$app_path")"

printf 'ssh_reachable=yes\n'
printf 'architecture=%s\n' "$(uname -m 2>/dev/null || printf unknown)"
printf 'project_exists=%s\n' "$(yes_no_path "$ODIN_PROJECT")"
printf 'env_exists=%s\n' "$(yes_no_path "$ODIN_PROJECT/.env")"
printf 'bun_exists=%s\n' "$(yes_no_exec /storage/bin/bun)"
printf 'nix_store_exists=%s\n' "$(yes_no_path /nix/store)"
if grep -qs ' /nix ' /proc/mounts; then printf 'nix_store_mounted=yes\n'; else printf 'nix_store_mounted=no\n'; fi
printf 'nix_command_exists=%s\n' "$(yes_no_command nix)"
printf 'nix_profile_exists=%s\n' "$(yes_no_path /storage/.nix-profile)"
printf 'portable_nix_exists=%s\n' "$(yes_no_path /storage/.nix-portable)"
printf 'korri_desktop_app_path=%s\n' "${app_path:-unknown}"
printf 'korri_desktop_app_origin=%s\n' "$app_origin"
printf 'app_state_root_writable=%s\n' "$(state_root_writable "$KORRI_ELECTROBUN_STATE_ROOT")"
printf 'sway_active=%s\n' "$(yes_no_service_active sway.service)"
printf 'essway_active=%s\n' "$(yes_no_service_active essway.service)"
if pgrep -f emulationstation >/dev/null 2>&1; then printf 'emulationstation_running=yes\n'; else printf 'emulationstation_running=no\n'; fi
storage_available_kb="$(df -k /storage 2>/dev/null | awk 'NR == 2 { print $4 }')"
printf 'storage_available_kb=%s\n' "${storage_available_kb:-unknown}"
REMOTE
  then
    true
  else
    printf 'ssh_reachable=no\n'
  fi
)"

printf '%s\n' "$facts" | bun run "$REPO_ROOT/tools/desktop/odin-desktop-preflight.ts"
