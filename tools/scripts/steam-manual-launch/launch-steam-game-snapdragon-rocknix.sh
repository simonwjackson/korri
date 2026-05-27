#!/run/current-system/sw/bin/nix-shell
#! nix-shell -i bash
#! nix-shell -I nixpkgs=flake:nixpkgs
#! nix-shell -p bash coreutils glib
# ROCKNIX/Snapdragon adapter for the platform-agnostic manual Steam game launcher.
# Defaults target the Thor/SM8550 Balatro manual-launch shape documented in
# docs/solutions/best-practices/manual-steam-game-launching-rocknix-arm64-2026-05-04.md.

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

export APP_ID="${APP_ID:-2379780}"
export STEAM_ROOT="${STEAM_ROOT:-/storage/games-internal/roms/steam}"
export GAME_EXE="${GAME_EXE:-$STEAM_ROOT/steamapps/common/Balatro/Balatro.exe}"

if [ -z "${PROTON:-}" ]; then
  for candidate in \
    "$STEAM_ROOT/compatibilitytools.d/GE-Proton10-34/proton" \
    "$STEAM_ROOT/steamapps/common/Proton 10.0/proton" \
    "$STEAM_ROOT/steamapps/common/Proton 11.0/proton"; do
    if [ -x "$candidate" ]; then
      export PROTON="$candidate"
      break
    fi
  done
fi

export STEAM_RUN_WRAPPER="${STEAM_RUN_WRAPPER:-none}"
export REQUIRE_STEAM="${REQUIRE_STEAM:-1}"
export AUTO_START_STEAM="${AUTO_START_STEAM:-0}"
if [ -z "${STEAM_START_COMMAND:-}" ] && [ -x /storage/bin/start_steam_desktop_ui.sh ]; then
  export STEAM_START_COMMAND=/storage/bin/start_steam_desktop_ui.sh
fi
export USE_GAMESCOPE="${USE_GAMESCOPE:-1}"
export GAMESCOPE_BACKEND="${GAMESCOPE_BACKEND:-sdl}"
export GAMESCOPE_OUT_W="${GAMESCOPE_OUT_W:-1920}"
export GAMESCOPE_OUT_H="${GAMESCOPE_OUT_H:-1080}"
export GAMESCOPE_GAME_W="${GAMESCOPE_GAME_W:-1920}"
export GAMESCOPE_GAME_H="${GAMESCOPE_GAME_H:-1080}"
export GAMESCOPE_REFRESH="${GAMESCOPE_REFRESH:-120}"
export SDL_VIDEODRIVER="${SDL_VIDEODRIVER:-x11}"
export PROTON_LOG_DIR="${PROTON_LOG_DIR:-/storage/korri-steam-manual-$APP_ID-$(date +%Y%m%d-%H%M%S)}"

if [ -z "${GAMESCOPE_BIN:-}" ] && [ -x /host/bin/gamescope ]; then
  export GAMESCOPE_BIN=/host/bin/gamescope
fi

exec "$SCRIPT_DIR/launch-steam-game.sh" "$@"
