#!/usr/bin/env bash
set -euo pipefail

root="${KORRI_LIVE_USB_PERSISTENCE_ROOT:?KORRI_LIVE_USB_PERSISTENCE_ROOT is required}"
boot_mount="${KORRI_LIVE_USB_BOOT_MOUNT:-/iso}"
label="${KORRI_LIVE_USB_PERSISTENCE_LABEL:-KORRI-PERSIST}"
marker_persistent="${KORRI_LIVE_USB_PERSISTENT_MARKER:-.korri-live-usb-persistent}"
marker_ephemeral="${KORRI_LIVE_USB_EPHEMERAL_MARKER:-.korri-live-usb-ephemeral}"
state_user="${KORRI_LIVE_USB_STATE_USER:-korri-kiosk}"
state_group="${KORRI_LIVE_USB_STATE_GROUP:-$state_user}"
skip_block_device_check="${KORRI_LIVE_USB_SKIP_BLOCK_DEVICE_CHECK:-0}"

mkdir -p "$root"
chmod 0755 "$root"

prepare_state_tree() {
  mkdir -p "$root/home/.config" "$root/home/.local/share" "$root/home/.local/state" "$root/home/.cache/moonlight"
  chown -R "$state_user:$state_group" "$root/home"
  chmod 0755 "$root"
  chmod 0700 "$root/home"
}

mount_tmpfs() {
  if ! mountpoint -q "$root"; then
    mount -t tmpfs -o mode=0755,size=512M korri-live-usb-state "$root"
  fi
  prepare_state_tree
  touch "$root/$marker_ephemeral"
  echo "korri-live-usb: persistence partition not found beside boot USB media; using ephemeral tmpfs state" >&2
}

boot_source="$(findmnt -n -o SOURCE --target "$boot_mount" 2>/dev/null || true)"
if [ -z "$boot_source" ]; then
  mount_tmpfs
  exit 0
fi

boot_device="$(readlink -f "$boot_source" 2>/dev/null || true)"
if [ -z "$boot_device" ] || { [ "$skip_block_device_check" != "1" ] && [ ! -b "$boot_device" ]; }; then
  mount_tmpfs
  exit 0
fi

parent_name="$(lsblk -no PKNAME "$boot_device" 2>/dev/null | head -n 1 | tr -d '[:space:]')"
if [ -z "$parent_name" ]; then
  parent_device="$boot_device"
else
  parent_device="/dev/$parent_name"
fi

if [ "$skip_block_device_check" != "1" ] && [ ! -b "$parent_device" ]; then
  mount_tmpfs
  exit 0
fi

parent_transport="$(lsblk -ndo TRAN "$parent_device" 2>/dev/null | head -n 1 | tr -d '[:space:]')"
parent_removable="$(lsblk -ndo RM "$parent_device" 2>/dev/null | head -n 1 | tr -d '[:space:]')"
if [ "$parent_transport" != "usb" ] && [ "$parent_removable" != "1" ]; then
  echo "korri-live-usb: boot media parent $parent_device is not removable USB; using ephemeral tmpfs state" >&2
  mount_tmpfs
  exit 0
fi

while IFS= read -r candidate; do
  [ -n "$candidate" ] || continue
  [ "$candidate" != "$boot_device" ] || continue
  candidate_label="$(blkid -s LABEL -o value "$candidate" 2>/dev/null || true)"
  if [ "$candidate_label" = "$label" ]; then
    if mount "$candidate" "$root"; then
      prepare_state_tree
      touch "$root/$marker_persistent"
      exit 0
    fi
    echo "korri-live-usb: failed to mount candidate persistence partition $candidate; falling back to ephemeral tmpfs state" >&2
    mount_tmpfs
    exit 0
  fi
done < <(lsblk -nrpo NAME,TYPE "$parent_device" | awk '$2 == "part" { print $1 }')

mount_tmpfs
