#!/usr/bin/env bash
set -euo pipefail

ssh_options=(
  -o BatchMode=yes
  -o ConnectTimeout=5
  -o ServerAliveInterval=5
  -o ServerAliveCountMax=2
)
case "${1:-}" in
  restart|logs|provision-game)
    exec ssh "${ssh_options[@]}" zao ~/.local/libexec/korrid-deploy "$1"
    ;;
  *)
    echo "usage: $0 {restart|logs|provision-game}" >&2
    exit 2
    ;;
esac
