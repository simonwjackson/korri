#!/usr/bin/env bash
set -euo pipefail

rom="${1:?usage: provision-zao-wario.sh /path/to/wl4.gba}"
if [[ ! -f "$rom" ]]; then
  echo "Wario Land 4 ROM is not a file: $rom" >&2
  exit 1
fi

ssh_options=(
  -o BatchMode=yes
  -o ConnectTimeout=5
  -o ServerAliveInterval=5
  -o ServerAliveCountMax=2
)
remote_tmp="$(ssh "${ssh_options[@]}" zao mktemp -d /tmp/wario-provision.XXXXXX)"
cleanup() {
  ssh "${ssh_options[@]}" zao rm -rf -- "$remote_tmp" || true
}
trap cleanup EXIT

scp "${ssh_options[@]}" "$rom" "zao:$remote_tmp/wl4.gba"
local_hash="$(sha256sum "$rom" | cut -d' ' -f1)"
remote_hash="$(ssh "${ssh_options[@]}" zao sha256sum "$remote_tmp/wl4.gba" | cut -d' ' -f1)"
if [[ "$local_hash" != "$remote_hash" ]]; then
  echo "Wario Land 4 ROM changed during transfer" >&2
  exit 1
fi
ssh "${ssh_options[@]}" zao "
  set -e
  install -d -m 0700 \"\$HOME/.local/share/korri/roms\"
  install -m 0600 '$remote_tmp/wl4.gba' \"\$HOME/.local/share/korri/roms/wl4.gba\"
"
echo "Wario Land 4 provisioned privately on zao ($local_hash)"
