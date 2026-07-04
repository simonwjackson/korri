#!/usr/bin/env bash
# Rasterize the Korri Lab PWA icon (icon.svg) into the PNG sizes required for
# installability. Uses resvg from nixpkgs so no host rasterizer is assumed.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

render() {
  local size="$1"
  nix run nixpkgs#resvg -- icon.svg "icon-${size}.png" --width "$size" --height "$size"
}

render 192
render 512

echo "Rendered:"
ls -l icon-192.png icon-512.png
