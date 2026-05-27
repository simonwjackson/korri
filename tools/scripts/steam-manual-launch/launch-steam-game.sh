#!/run/current-system/sw/bin/nix-shell
#! nix-shell -i bash
#! nix-shell -I nixpkgs=flake:nixpkgs
#! nix-shell -p bash coreutils procps glib
# Platform-agnostic manual Steam game launcher.
#
# This script owns the common Steam Runtime -> Proton -> game contract. Platform
# adapters set defaults such as steam-run on NixOS/x86 or nested Gamescope on
# ROCKNIX/Snapdragon.
#
# Required environment:
#   APP_ID=2379780
#   GAME_EXE=/absolute/path/to/Game.exe
#   PROTON=/absolute/path/to/proton
#
# Common optional environment:
#   STEAM_ROOT=$HOME/.local/share/Steam
#   STEAM_RUNTIME=$STEAM_ROOT/steamapps/common/SteamLinuxRuntime_sniper/_v2-entry-point
#   STEAM_RUN_WRAPPER=auto|none|/path/to/steam-run
#   USE_GAMESCOPE=0|1
#   REQUIRE_STEAM=1

set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: launch-steam-game.sh [--check]

Required env:
  APP_ID       Steam app id, e.g. 2379780.
  GAME_EXE     Absolute path to the Windows game executable.
  PROTON       Absolute path to the Proton executable.

Optional env:
  STEAM_ROOT        Default: $HOME/.local/share/Steam
  STEAM_RUNTIME     Default: $STEAM_ROOT/steamapps/common/SteamLinuxRuntime_sniper/_v2-entry-point
  STEAM_RUN_WRAPPER Default: auto. Uses steam-run when available. Set to none/direct for no wrapper.
  USE_GAMESCOPE     Set to 1 to run Runtime -> Proton -> Game inside gamescope.
  GAMESCOPE_BIN     Default: gamescope, or /host/bin/gamescope when present.
  GAMESCOPE_BACKEND Default: sdl
  GAMESCOPE_OUT_W   Default: 1920
  GAMESCOPE_OUT_H   Default: 1080
  GAMESCOPE_GAME_W  Default: $GAMESCOPE_OUT_W
  GAMESCOPE_GAME_H  Default: $GAMESCOPE_OUT_H
  GAMESCOPE_REFRESH Default: 120
  REQUIRE_STEAM     Set to 1 to require the Linux Steam client context.
  AUTO_START_STEAM  Set to 1 to start Steam when REQUIRE_STEAM=1 and Steam is not running.
  STEAM_START_COMMAND Command string used when AUTO_START_STEAM=1.
  STEAM_START_TIMEOUT Seconds to wait for Steam readiness. Default: 90.
  STEAM_READY_SETTLE_SECONDS Extra seconds to wait after auto-start readiness. Default: 0.
  PROTON_LOG_DIR    Default: /tmp/korri-steam-manual-<appid>-<timestamp>

Modes:
  --check           Validate paths and print the resolved launch environment.
EOF
  exit 64
}

mode="run"
case "${1:-}" in
  "") ;;
  --check) mode="check" ;;
  -h|--help) usage ;;
  *) usage ;;
esac

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    printf 'launch-steam-game: missing required env %s\n' "$name" >&2
    exit 64
  fi
}

require_path() {
  local label="$1"
  local path="$2"
  if [ ! -e "$path" ]; then
    printf 'launch-steam-game: missing %s: %s\n' "$label" "$path" >&2
    exit 66
  fi
}

require_executable() {
  local label="$1"
  local path="$2"
  require_path "$label" "$path"
  if [ ! -x "$path" ]; then
    printf 'launch-steam-game: %s is not executable: %s\n' "$label" "$path" >&2
    exit 66
  fi
}

command_available() {
  local command_name="$1"
  if [[ "$command_name" == */* ]]; then
    [ -x "$command_name" ]
  else
    command -v "$command_name" >/dev/null 2>&1
  fi
}

is_enabled() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

# D-Bus name claimed by steam-runtime-launcher-service --alongside-steam
# once Steam has finished bootstrapping and is ready to receive game
# launches. This is the same readiness signal Valve's own session uses;
# pgrep on `steam` matches the wrapper binary the moment it forks (long
# before the client is actually able to launch games), which causes a
# fragile race window where downstream Runtime/Proton launches see
# `steam_running=yes` but Steam dies seconds later in libX11 init.
STEAM_READY_DBUS_NAME="${STEAM_READY_DBUS_NAME:-com.steampowered.PressureVessel.LaunchAlongsideSteam}"

is_steam_dbus_ready() {
  command_available gdbus || return 2
  gdbus call --session \
    --dest org.freedesktop.DBus \
    --object-path / \
    --method org.freedesktop.DBus.NameHasOwner \
    "$STEAM_READY_DBUS_NAME" 2>/dev/null \
    | grep -q 'true,'
}

is_steam_running() {
  # Prefer the D-Bus readiness signal; only fall back to pgrep when
  # gdbus is unavailable (older systems, container shells, etc).
  if is_steam_dbus_ready; then
    return 0
  fi
  case $? in
    1) return 1 ;;       # gdbus said "name not owned" -> Steam not ready
    2) ;;                # gdbus missing -> pgrep fallback below
    *) return 1 ;;
  esac
  pgrep -x steam >/dev/null 2>&1 || pgrep -f '[s]teamwebhelper' >/dev/null 2>&1
}

wait_for_steam_ready() {
  local timeout_seconds="$1"
  if command_available gdbus; then
    # `gdbus wait` blocks on the session bus until the name appears,
    # using dbus signals instead of polling. Exits 0 on acquire, 1 on
    # timeout. This is what eliminates the pgrep race + 20s settle.
    gdbus wait --session --timeout "$timeout_seconds" "$STEAM_READY_DBUS_NAME"
    return $?
  fi
  local i
  for i in $(seq 1 "$timeout_seconds"); do
    is_steam_running && return 0
    sleep 1
  done
  return 1
}

start_steam_if_requested() {
  if ! is_enabled "${AUTO_START_STEAM:-0}"; then
    return 1
  fi

  if [ -z "${STEAM_START_COMMAND:-}" ]; then
    if command_available steam; then
      STEAM_START_COMMAND="steam -silent"
    else
      printf 'launch-steam-game: AUTO_START_STEAM=1 but STEAM_START_COMMAND is unset and steam is not on PATH\n' >&2
      return 1
    fi
  fi

  local timeout_seconds="${STEAM_START_TIMEOUT:-90}"
  local start_log="${STEAM_START_LOG:-$PROTON_LOG_DIR/steam-start.log}"
  printf 'launch-steam-game: Steam is not running; starting with: %s\n' "$STEAM_START_COMMAND" >&2
  printf 'started_at=%s\ncommand=%s\n' "$(date --iso-8601=seconds 2>/dev/null || date)" "$STEAM_START_COMMAND" >"$start_log"
  bash -lc "$STEAM_START_COMMAND" >>"$start_log" 2>&1 &

  if wait_for_steam_ready "$timeout_seconds"; then
    printf 'launch-steam-game: Steam ready (%s acquired on session bus)\n' "$STEAM_READY_DBUS_NAME" >&2
    return 0
  fi

  printf 'launch-steam-game: Steam did not become ready within %s seconds; see %s\n' "$timeout_seconds" "$start_log" >&2
  return 1
}

print_command() {
  local -n command_ref=$1
  local token
  for token in "${command_ref[@]}"; do
    printf '%q ' "$token"
  done
  printf '\n'
}

require_env APP_ID
require_env GAME_EXE
require_env PROTON

STEAM_ROOT="${STEAM_ROOT:-$HOME/.local/share/Steam}"
STEAM_RUNTIME="${STEAM_RUNTIME:-$STEAM_ROOT/steamapps/common/SteamLinuxRuntime_sniper/_v2-entry-point}"
PROTON_ROOT="${PROTON_ROOT:-$(dirname "$PROTON")}"
GAME_DIR="${GAME_DIR:-$(dirname "$GAME_EXE")}"
STEAM_APPS="${STEAM_APPS:-$STEAM_ROOT/steamapps}"
STEAM_RUNTIME_DIR="${STEAM_RUNTIME_DIR:-$(dirname "$STEAM_RUNTIME")}"
STEAMWORKS_SHARED="${STEAMWORKS_SHARED:-$STEAM_APPS/common/Steamworks Shared}"
STEAM_COMPAT_DATA_PATH="${STEAM_COMPAT_DATA_PATH:-$STEAM_APPS/compatdata/$APP_ID}"
STEAM_RUN_WRAPPER="${STEAM_RUN_WRAPPER:-auto}"
USE_GAMESCOPE="${USE_GAMESCOPE:-0}"
REQUIRE_STEAM="${REQUIRE_STEAM:-0}"
AUTO_START_STEAM="${AUTO_START_STEAM:-0}"
STEAM_START_TIMEOUT="${STEAM_START_TIMEOUT:-90}"
STEAM_READY_SETTLE_SECONDS="${STEAM_READY_SETTLE_SECONDS:-0}"

case "$STEAM_RUN_WRAPPER" in
  auto)
    if command_available steam-run; then
      STEAM_RUN_WRAPPER="steam-run"
    else
      STEAM_RUN_WRAPPER=""
    fi
    ;;
  none|direct)
    STEAM_RUN_WRAPPER=""
    ;;
esac

if is_enabled "$USE_GAMESCOPE"; then
  if [ -z "${GAMESCOPE_BIN:-}" ]; then
    if [ -x /host/bin/gamescope ]; then
      GAMESCOPE_BIN=/host/bin/gamescope
    else
      GAMESCOPE_BIN=gamescope
    fi
  fi
  GAMESCOPE_BACKEND="${GAMESCOPE_BACKEND:-sdl}"
  GAMESCOPE_OUT_W="${GAMESCOPE_OUT_W:-1920}"
  GAMESCOPE_OUT_H="${GAMESCOPE_OUT_H:-1080}"
  GAMESCOPE_GAME_W="${GAMESCOPE_GAME_W:-$GAMESCOPE_OUT_W}"
  GAMESCOPE_GAME_H="${GAMESCOPE_GAME_H:-$GAMESCOPE_OUT_H}"
  GAMESCOPE_REFRESH="${GAMESCOPE_REFRESH:-120}"
  GAMESCOPE_XWAYLAND_COUNT="${GAMESCOPE_XWAYLAND_COUNT:-1}"
fi

if [ -z "${PROTON_LOG_DIR:-}" ]; then
  PROTON_LOG_DIR="/tmp/korri-steam-manual-${APP_ID}-$(date +%Y%m%d-%H%M%S)"
fi

require_path "Steam root" "$STEAM_ROOT"
require_path "Steam apps directory" "$STEAM_APPS"
require_executable "Steam Runtime entry point" "$STEAM_RUNTIME"
require_executable "Proton executable" "$PROTON"
require_path "game executable" "$GAME_EXE"
require_path "Steam compatdata directory" "$STEAM_COMPAT_DATA_PATH"

if [ -n "$STEAM_RUN_WRAPPER" ] && ! command_available "$STEAM_RUN_WRAPPER"; then
  printf 'launch-steam-game: STEAM_RUN_WRAPPER not found or not executable: %s\n' "$STEAM_RUN_WRAPPER" >&2
  exit 69
fi

if is_enabled "$USE_GAMESCOPE" && ! command_available "$GAMESCOPE_BIN"; then
  printf 'launch-steam-game: GAMESCOPE_BIN not found or not executable: %s\n' "$GAMESCOPE_BIN" >&2
  exit 69
fi

mkdir -p "$PROTON_LOG_DIR"

steam_started="no"
steam_start_needed="no"
steam_running="no"
if is_steam_running; then
  steam_running="yes"
elif [ "$REQUIRE_STEAM" = "1" ]; then
  if [ "$mode" = "check" ] && is_enabled "$AUTO_START_STEAM"; then
    steam_start_needed="yes"
  elif start_steam_if_requested && is_steam_running; then
    steam_running="yes"
    steam_started="yes"
    if [ "$STEAM_READY_SETTLE_SECONDS" != "0" ]; then
      printf 'launch-steam-game: waiting %s extra seconds for Steam session readiness\n' "$STEAM_READY_SETTLE_SECONDS" >&2
      sleep "$STEAM_READY_SETTLE_SECONDS"
    fi
  else
    printf 'launch-steam-game: Steam is not running; start Steam first or set AUTO_START_STEAM=1 with STEAM_START_COMMAND\n' >&2
    exit 69
  fi
fi

export STEAM_COMPAT_CLIENT_INSTALL_PATH="$STEAM_ROOT"
export STEAM_COMPAT_DATA_PATH
export STEAM_COMPAT_INSTALL_PATH="$GAME_DIR"
export STEAM_COMPAT_LIBRARY_PATHS="$STEAM_APPS"
export STEAM_COMPAT_TOOL_PATHS="$PROTON_ROOT:$STEAM_RUNTIME_DIR"
if [ -e "$STEAMWORKS_SHARED" ]; then
  export STEAM_COMPAT_MOUNTS="${STEAM_COMPAT_MOUNTS:-$STEAMWORKS_SHARED:$STEAM_RUNTIME_DIR}"
else
  export STEAM_COMPAT_MOUNTS="${STEAM_COMPAT_MOUNTS:-$STEAM_RUNTIME_DIR}"
fi
export STEAM_COMPAT_PROTON="${STEAM_COMPAT_PROTON:-1}"
export STEAM_COMPAT_APP_ID="$APP_ID"
export SteamAppId="$APP_ID"
export SteamGameId="$APP_ID"
export SteamOverlayGameId="${SteamOverlayGameId:-$APP_ID}"
export PROTON_LOG="${PROTON_LOG:-1}"
export PROTON_LOG_DIR
export WINEDEBUG="${WINEDEBUG:--all}"
export PROTON_USE_XALIA="${PROTON_USE_XALIA:-0}"
export XALIA_SUPPORTED_ONLY="${XALIA_SUPPORTED_ONLY:-0}"

runtime_command=(
  "$STEAM_RUNTIME"
  --verb=waitforexitandrun
  --
  "$PROTON"
  waitforexitandrun
  "$GAME_EXE"
)

# steam-run must wrap the inner Runtime -> Proton -> Game chain so NixOS stub-ld
# does not block pressure-vessel-wrap. When it wraps the outer gamescope instead,
# pressure-vessel's ldconfig hits a symlink loop inside the doubled FHS sandbox.
if [ -n "$STEAM_RUN_WRAPPER" ]; then
  runtime_command=("$STEAM_RUN_WRAPPER" "${runtime_command[@]}")
fi

launch_command=("${runtime_command[@]}")
if is_enabled "$USE_GAMESCOPE"; then
  launch_command=(
    "$GAMESCOPE_BIN"
    --backend "$GAMESCOPE_BACKEND"
    -W "$GAMESCOPE_OUT_W"
    -H "$GAMESCOPE_OUT_H"
    -w "$GAMESCOPE_GAME_W"
    -h "$GAMESCOPE_GAME_H"
    -r "$GAMESCOPE_REFRESH"
    --xwayland-count "$GAMESCOPE_XWAYLAND_COUNT"
    --force-windows-fullscreen
    -f
    -b
    --
    "${launch_command[@]}"
  )
fi

{
  printf 'started_at=%s\n' "$(date --iso-8601=seconds 2>/dev/null || date)"
  printf 'mode=%s\n' "$mode"
  printf 'steam_running=%s\n' "$steam_running"
  printf 'steam_started=%s\n' "$steam_started"
  printf 'steam_start_needed=%s\n' "$steam_start_needed"
  printf 'steam_root=%s\n' "$STEAM_ROOT"
  printf 'app_id=%s\n' "$APP_ID"
  printf 'runtime=%s\n' "$STEAM_RUNTIME"
  printf 'proton=%s\n' "$PROTON"
  printf 'game=%s\n' "$GAME_EXE"
  printf 'steam_run_wrapper=%s\n' "${STEAM_RUN_WRAPPER:-<none>}"
  printf 'use_gamescope=%s\n' "$USE_GAMESCOPE"
  printf 'auto_start_steam=%s\n' "$AUTO_START_STEAM"
  if [ -n "${STEAM_START_COMMAND:-}" ]; then
    printf 'steam_start_command=%s\n' "$STEAM_START_COMMAND"
  fi
  printf 'steam_ready_settle_seconds=%s\n' "$STEAM_READY_SETTLE_SECONDS"
  if is_enabled "$USE_GAMESCOPE"; then
    printf 'gamescope_bin=%s\n' "$GAMESCOPE_BIN"
    printf 'gamescope_backend=%s\n' "$GAMESCOPE_BACKEND"
    printf 'gamescope_geometry=%sx%s -> %sx%s @ %s\n' \
      "$GAMESCOPE_GAME_W" "$GAMESCOPE_GAME_H" "$GAMESCOPE_OUT_W" "$GAMESCOPE_OUT_H" "$GAMESCOPE_REFRESH"
  fi
  printf 'proton_log_dir=%s\n' "$PROTON_LOG_DIR"
  printf 'command='
  print_command launch_command
} | tee "$PROTON_LOG_DIR/launch-env.log" >&2

if [ "$mode" = "check" ]; then
  exit 0
fi

exec "${launch_command[@]}"
