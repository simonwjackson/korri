#!/usr/bin/env nix-shell
#! nix-shell -i bash --pure
#! nix-shell -p moonlight-qt coreutils gawk gnugrep
#
# pair-moonlight.sh -- CLI pair the guest's Moonlight client with a Sunshine
# host, without going through the (currently-flaky) Moonlight Wayland GUI on
# SM8550.
#
# Why: the kiosk session can launch Moonlight for streaming once a host is
# paired, but the GUI pair flow on Sway+SM8550 crashes the Qt event loop
# (Qt Wayland EGL on Adreno) before a window is ever shown. CLI pair uses
# `QT_QPA_PLATFORM=offscreen`, so it has no display dependency.
#
# Run this from a regular SSH shell on the guest, NOT from inside the kiosk
# Sway session:
#
#   /storage/.guest/pair-moonlight.sh <host> [pin]
#
# Examples:
#
#   /storage/.guest/pair-moonlight.sh aka
#   /storage/.guest/pair-moonlight.sh 192.168.1.117 4242
#
# If no PIN is supplied, a fresh 4-digit PIN is generated. The PIN is printed
# before the pair request fires so the operator can enter the same PIN in
# Sunshine's web UI at https://<host>:47990. Sunshine's port is well-known
# (47989 control / 47990 web UI / 47984 HTTPS).
#
# On success, Moonlight writes the host's srvcert into
# ~/.config/Moonlight\ Game\ Streaming\ Project/Moonlight.conf, after which
# `moonlight stream <host> <app>` (and the Korri kiosk's `launch-bridge`)
# can start streams without any further interaction.

set -eu

usage() {
  cat >&2 <<EOF
Usage: $(basename "$0") <host> [pin]

  host  Sunshine host name, IP, or UUID (e.g. aka, 192.168.1.117).
  pin   Optional 4-digit pairing PIN. Generated if omitted.
EOF
  exit 64
}

host="${1:-}"
[ -z "$host" ] && usage

pin="${2:-}"
if [ -z "$pin" ]; then
  # 4 digits with a non-zero leading digit. Leading zeros render the PIN as
  # "0042" which can confuse operators entering it in Sunshine's PIN field.
  pin=$(awk 'BEGIN{srand(); print int(rand()*9000) + 1000}')
fi

case "$pin" in
  [1-9][0-9][0-9][0-9]) ;;
  *) printf 'pair-moonlight: pin must be 4 digits with a non-zero leading digit, got "%s"\n' "$pin" >&2; exit 64 ;;
esac

cat <<EOF

  ========================================
  Pairing host : $host
  PIN          : $pin
  ========================================

  1. Open Sunshine web UI :  https://$host:47990
  2. Type this PIN exactly :  $pin
  3. Submit                :  the page may also require a device name.

  Moonlight will block here for up to ~60s waiting for the PIN.

  If Sunshine shows "Pairing Failed: Check if the PIN is typed correctly",
  the on-disk pair state on the Sunshine host probably has a stale entry
  for this client. Remove it from Sunshine's "Clients" page and re-run
  this script.

EOF

# Offscreen Qt avoids the Qt Wayland EGL crash on Adreno and avoids EGLFS
# fighting Sway for the DSI panel when this script is run from an SSH shell.
export QT_QPA_PLATFORM=offscreen
export LC_ALL=C.UTF-8

# Forward Moonlight's stdout/stderr so the operator sees Sunshine's verdict
# ("Pairing was successful" / "Incorrect PIN") inline.
exec moonlight --pin "$pin" pair "$host"
