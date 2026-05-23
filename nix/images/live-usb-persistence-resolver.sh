#!/usr/bin/env bash
set -euo pipefail

root="${KORRI_LIVE_USB_PERSISTENCE_ROOT:?KORRI_LIVE_USB_PERSISTENCE_ROOT is required}"
boot_mount="${KORRI_LIVE_USB_BOOT_MOUNT:-/iso}"
label="${KORRI_LIVE_USB_PERSISTENCE_LABEL:-KORRI-PERSIST}"
marker_persistent="${KORRI_LIVE_USB_PERSISTENT_MARKER:-.korri-live-usb-persistent}"
marker_ephemeral="${KORRI_LIVE_USB_EPHEMERAL_MARKER:-.korri-live-usb-ephemeral}"

mkdir -p "$root"
chmod 0700 "$root"

mount_tmpfs() {
  if ! mountpoint -q "$root"; then
    mount -t tmpfs -o mode=0700,size=512M korri-live-usb-state "$root"
  fi
  touch "$root/$marker_ephemeral"
  echo "korri-live-usb: persistence partition not found beside boot media; using ephemeral tmpfs state" >&2
}

boot_source="$(findmnt -n -o SOURCE --target "$boot_mount" 2>/dev/null || true)"
if [ -z "$boot_source" ]; then
  mount_tmpfs
  exit 0
fi

boot_device="$(readlink -f "$boot_source" 2>/dev/null || true)"
if [ -z "$boot_device" ] || [ ! -b "$boot_device" ]; then
  mount_tmpfs
  exit 0
fi

parent_name="$(lsblk -no PKNAME "$boot_device" 2>/dev/null | head -n 1 | tr -d '[:space:]')"
if [ -z "$parent_name" ]; then
  parent_device="$boot_device"
else
  parent_device="/dev/$parent_name"
fi

if [ ! -b "$parent_device" ]; then
  mount_tmpfs
  exit 0
fi

while IFS= read -r candidate; do
  [ -n "$candidate" ] || continue
  [ "$candidate" != "$boot_device" ] || continue
  candidate_label="$(blkid -s LABEL -o value "$candidate" 2>/dev/null || true)"
  if [ "$candidate_label" = "$label" ]; then
    mount "$candidate" "$root"
    chmod 0700 "$root"
    mkdir -p "$root/home/.config" "$root/home/.local/share" "$root/home/.local/state" "$root/home/.cache/moonlight"
    touch "$root/$marker_persistent"
    exit 0
  fi
done < <(lsblk -nrpo NAME,TYPE "$parent_device" | awk '$2 == "part" { print $1 }')

mount_tmpfs
