#!/run/current-system/sw/bin/nix-shell
#! nix-shell -i bash
#! nix-shell -I nixpkgs=flake:nixpkgs
#! nix-shell -p bash coreutils glib
# AKA/x86 adapter for the platform-agnostic manual Steam game launcher.
# Defaults target the Balatro + GE-Proton10-32 evidence captured on aka.

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

if [ -d /run/current-system/sw/bin ]; then
  export PATH="/run/current-system/sw/bin:${PATH:-}"
fi

export APP_ID="${APP_ID:-2379780}"
export STEAM_ROOT="${STEAM_ROOT:-/home/simonwjackson/.local/share/Steam}"
export GAME_EXE="${GAME_EXE:-$STEAM_ROOT/steamapps/common/Balatro/Balatro.exe}"
export PROTON="${PROTON:-/nix/store/4rs08c11akpkmznhnid754g1spw9739y-proton-ge-bin-GE-Proton10-32-steamcompattool/proton}"
export STEAM_RUN_WRAPPER="${STEAM_RUN_WRAPPER:-/run/current-system/sw/bin/steam-run}"
export REQUIRE_STEAM="${REQUIRE_STEAM:-1}"
export AUTO_START_STEAM="${AUTO_START_STEAM:-1}"
export STEAM_START_COMMAND="${STEAM_START_COMMAND:-/run/current-system/sw/bin/steam -silent}"
# The core launcher now waits on Steam's runtime-launcher-service D-Bus
# name (com.steampowered.PressureVessel.LaunchAlongsideSteam) for its
# readiness signal, so the fixed-duration settle that previously
# papered over pgrep races is no longer required.
export STEAM_READY_SETTLE_SECONDS="${STEAM_READY_SETTLE_SECONDS:-0}"
export USE_GAMESCOPE="${USE_GAMESCOPE:-0}"

exec "$SCRIPT_DIR/launch-steam-game.sh" "$@"
