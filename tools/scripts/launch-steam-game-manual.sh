#!/run/current-system/sw/bin/nix-shell
#! nix-shell -i bash
#! nix-shell -I nixpkgs=flake:nixpkgs
#! nix-shell -p bash coreutils glib
# Compatibility entrypoint for the platform-agnostic manual Steam launcher.
# New platform adapters live next to the core script in tools/scripts/steam-manual-launch/.

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec "$SCRIPT_DIR/steam-manual-launch/launch-steam-game.sh" "$@"
