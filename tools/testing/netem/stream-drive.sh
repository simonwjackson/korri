#!/usr/bin/env bash
set -euo pipefail

DEVICE=${DEVICE:-}
IFACE=${IFACE:-}
ACTION=${1:-help}

usage() {
  cat <<'USAGE'
Usage: DEVICE=<ssh-host> IFACE=<iface> stream-drive.sh <action>

Actions:
  slope     gradually constrain bandwidth with latency/jitter
  cliff     hard bandwidth collapse for adaptive shed testing
  tunnel    100% loss window, then recover
  clear     remove qdisc shaping

This is an operator helper for U12/U13 validation. Run it against a test path only.
USAGE
}

require_target() {
  if [[ -z "$DEVICE" || -z "$IFACE" ]]; then
    usage >&2
    exit 2
  fi
}

remote_tc() {
  ssh "$DEVICE" -- sudo tc "$@"
}

clear_qdisc() {
  remote_tc qdisc del dev "$IFACE" root 2>/dev/null || true
}

case "$ACTION" in
  slope)
    require_target
    clear_qdisc
    remote_tc qdisc add dev "$IFACE" root netem delay 35ms 8ms rate 12mbit loss 1%
    sleep 15
    remote_tc qdisc change dev "$IFACE" root netem delay 55ms 15ms rate 6mbit loss 2%
    sleep 15
    remote_tc qdisc change dev "$IFACE" root netem delay 80ms 25ms rate 3mbit loss 4%
    ;;
  cliff)
    require_target
    clear_qdisc
    remote_tc qdisc add dev "$IFACE" root netem delay 140ms 40ms rate 1mbit loss 12%
    ;;
  tunnel)
    require_target
    clear_qdisc
    remote_tc qdisc add dev "$IFACE" root netem loss 100%
    sleep "${TUNNEL_SECONDS:-8}"
    clear_qdisc
    ;;
  clear)
    require_target
    clear_qdisc
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
