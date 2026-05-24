#!/usr/bin/env bash
set -euo pipefail

root="${KORRI_LIVE_USB_PERSISTENCE_ROOT:?KORRI_LIVE_USB_PERSISTENCE_ROOT is required}"
boot_mount="${KORRI_LIVE_USB_BOOT_MOUNT:-/iso}"
label="${KORRI_LIVE_USB_PERSISTENCE_LABEL:-KORRI-PERSIST}"
marker_persistent="${KORRI_LIVE_USB_PERSISTENT_MARKER:-.korri-live-usb-persistent}"
marker_ephemeral="${KORRI_LIVE_USB_EPHEMERAL_MARKER:-.korri-live-usb-ephemeral}"
artifact="${KORRI_LIVE_USB_ARTIFACT:-product}"
runtime_home="${KORRI_LIVE_USB_RUNTIME_HOME:-/home/${KORRI_LIVE_USB_STATE_USER:-korri-kiosk}}"
device_id_target="${KORRI_LIVE_USB_DEVICE_ID_TARGET:-/var/lib/korri-live-usb/device-id}"
state_user="${KORRI_LIVE_USB_STATE_USER:-korri-kiosk}"
state_group="${KORRI_LIVE_USB_STATE_GROUP:-$state_user}"
skip_block_device_check="${KORRI_LIVE_USB_SKIP_BLOCK_DEVICE_CHECK:-0}"

mkdir -p "$root"
chmod 0755 "$root"

prepare_state_tree() {
  case "$artifact" in
    developer)
      prepare_developer_state_tree
      ;;
    product)
      prepare_product_state_tree
      ;;
    *)
      echo "korri-live-usb: unsupported persistence artifact '$artifact'" >&2
      return 1
      ;;
  esac
}

prepare_developer_state_tree() {
  mkdir -p "$root/developer/home/.config" "$root/developer/home/.local/share" "$root/developer/home/.local/state" "$root/developer/home/.cache/moonlight" || return 1
  chown -R "$state_user:$state_group" "$root/developer/home" || return 1
  chmod 0755 "$root" || return 1
  chmod 0700 "$root/developer/home" || return 1
}

prepare_product_state_tree() {
  created_links=()
  mkdir -p \
    "$runtime_home/.config" \
    "$runtime_home/.local/share" \
    "$runtime_home/.local/state" \
    "$runtime_home/.cache" \
    "$(dirname "$device_id_target")" \
    "$root/product/home/.config/korri" \
    "$root/product/home/.local/share/korri" \
    "$root/product/home/.local/state/korri" \
    "$root/product/home/.cache/moonlight" \
    "$root/product" || return 1

  chown -R "$state_user:$state_group" "$runtime_home" "$root/product/home" || return 1
  chmod 0755 "$root" || return 1
  chmod 0700 "$runtime_home" "$root/product/home" || return 1

  if [ ! -s "$root/product/device-id" ]; then
    generate_device_id > "$root/product/device-id" || return 1
  fi
  chown root:root "$root/product/device-id" || return 1
  chmod 0600 "$root/product/device-id" || return 1

  link_persistent_path "$root/product/home/.config/korri" "$runtime_home/.config/korri" created_links || return 1
  link_persistent_path "$root/product/home/.local/share/korri" "$runtime_home/.local/share/korri" created_links || return 1
  link_persistent_path "$root/product/home/.local/state/korri" "$runtime_home/.local/state/korri" created_links || return 1
  link_persistent_path "$root/product/home/.cache/moonlight" "$runtime_home/.cache/moonlight" created_links || return 1
  link_persistent_path "$root/product/device-id" "$device_id_target" created_links || return 1
}

link_persistent_path() {
  source_path="$1"
  target_path="$2"
  links_array_name="$3"
  mkdir -p "$(dirname "$target_path")" || return 1
  if [ -e "$target_path" ] || [ -L "$target_path" ]; then
    rm -rf "$target_path" || return 1
  fi
  if ln -s "$source_path" "$target_path"; then
    eval "$links_array_name+=(\"$target_path\")"
    return 0
  fi
  eval "for created in \"\${$links_array_name[@]}\"; do rm -f \"\$created\"; done"
  return 1
}

generate_device_id() {
  if [ -r /proc/sys/kernel/random/uuid ]; then
    cat /proc/sys/kernel/random/uuid
  else
    printf 'korri-live-usb-%s\n' "$(date +%s%N)"
  fi
}

mount_tmpfs() {
  if ! mountpoint -q "$root"; then
    mount -t tmpfs -o mode=0755,size=512M korri-live-usb-state "$root"
  fi
  prepare_state_tree
  touch "$root/$marker_ephemeral"
  echo "korri-live-usb: persistence partition not found beside boot USB media; using ephemeral tmpfs state" >&2
}

persistence_unavailable() {
  reason="$1"
  if [ "$artifact" = "developer" ]; then
    echo "korri-live-usb: Developer ISO requires retained same-stick persistence; $reason" >&2
    exit 1
  fi
  mount_tmpfs
  exit 0
}

boot_source="$(findmnt -n -o SOURCE --target "$boot_mount" 2>/dev/null || true)"
if [ -z "$boot_source" ]; then
  persistence_unavailable "boot mount $boot_mount was not found"
fi

boot_device="$(readlink -f "$boot_source" 2>/dev/null || true)"
if [ -z "$boot_device" ] || { [ "$skip_block_device_check" != "1" ] && [ ! -b "$boot_device" ]; }; then
  persistence_unavailable "boot source $boot_source did not resolve to a usable block device"
fi

parent_name="$(lsblk -no PKNAME "$boot_device" 2>/dev/null | head -n 1 | tr -d '[:space:]')"
if [ -z "$parent_name" ]; then
  parent_device="$boot_device"
else
  parent_device="/dev/$parent_name"
fi

if [ "$skip_block_device_check" != "1" ] && [ ! -b "$parent_device" ]; then
  persistence_unavailable "boot parent $parent_device is not a usable block device"
fi

parent_transport="$(lsblk -ndo TRAN "$parent_device" 2>/dev/null | head -n 1 | tr -d '[:space:]')"
parent_removable="$(lsblk -ndo RM "$parent_device" 2>/dev/null | head -n 1 | tr -d '[:space:]')"
if [ "$parent_transport" != "usb" ]; then
  persistence_unavailable "boot media parent $parent_device is not USB (transport=$parent_transport removable=$parent_removable)"
fi

while IFS= read -r candidate; do
  [ -n "$candidate" ] || continue
  [ "$candidate" != "$boot_device" ] || continue
  candidate_label="$(blkid -s LABEL -o value "$candidate" 2>/dev/null || true)"
  if [ "$candidate_label" = "$label" ]; then
    if mount "$candidate" "$root"; then
      if prepare_state_tree; then
        touch "$root/$marker_persistent"
        exit 0
      fi
      echo "korri-live-usb: mounted candidate persistence partition $candidate but could not prepare writable kiosk state; falling back to ephemeral tmpfs state" >&2
      umount "$root" >/dev/null 2>&1 || true
      persistence_unavailable "mounted candidate persistence partition $candidate but could not prepare writable kiosk state"
    else
      echo "korri-live-usb: failed to mount candidate persistence partition $candidate; falling back to ephemeral tmpfs state" >&2
      persistence_unavailable "failed to mount candidate persistence partition $candidate"
    fi
  fi
done < <(lsblk -nrpo NAME,TYPE "$parent_device" | awk '$2 == "part" { print $1 }')

persistence_unavailable "persistence partition labeled $label was not found beside boot USB media"
