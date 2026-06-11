#!/usr/bin/env bash
set -euo pipefail

# Two-gate matcher for Korri removable-media mounts.
#
# Gate 1 (positive): the candidate partition must be operator-swappable media —
# an SD/microSD partition (mmcblk*p*) when MMC matching is enabled, or a
# partition whose parent disk has USB transport when USB matching is enabled.
# An empty transport (virtio, dm, loop) is explicitly non-removable.
#
# Gate 2 (negative): the candidate's parent disk must not back any system
# mount. The deny-list is derived at runtime from ALL block-device-backed
# mounts visible in this namespace — not a fixed enumeration — so it stays
# correct as hardware passthrough widens. The configured required system
# mounts are an assertion set that must appear in the derived result.
#
# Fail-safe, never fail-open: any resolution error, an empty derived deny
# set, or a missing required system mount aborts the match. Only a
# successful, non-empty resolution permits a mount. This matters most on
# USB-enabled platforms where the deny-list is the only discriminator
# between the boot stick and a second operator USB stick.
#
# Usage: korri-removable-media-match.sh /dev/<partition>
# stdout on accept: the partition filesystem UUID — the media id that names
# the stable mountpoint and config-root entry. A UUID is required: UUID-less
# media is rejected (no usable identity, and the TOCTOU guard would be
# vacuous), and because the UUID originates in attacker-controlled media
# headers and becomes a path component, anything outside a conservative
# charset is rejected too.
# exit 0 = accept, 1 = reject, 2 = fail-safe abort

dev="${1:?usage: korri-removable-media-match.sh /dev/<partition>}"
match_mmc="${KORRI_REMOVABLE_MATCH_MMC:-1}"
match_usb="${KORRI_REMOVABLE_MATCH_USB:-0}"
required_system_mounts="${KORRI_REMOVABLE_REQUIRED_SYSTEM_MOUNTS:-/}"
skip_block_device_check="${KORRI_REMOVABLE_SKIP_BLOCK_DEVICE_CHECK:-0}"

name="$(basename "$dev")"

reject() {
  echo "korri-removable-media-match: rejecting $dev: $1" >&2
  exit 1
}

abort() {
  echo "korri-removable-media-match: aborting on $dev (fail-safe): $1" >&2
  exit 2
}

if [ "$skip_block_device_check" != "1" ] && [ ! -b "$dev" ]; then
  reject "not a block device"
fi

# Capture device identity up front; re-read and compare before accepting so a
# recycled device node (multi-slot hardware) cannot pass another card's check.
uuid_before="$(blkid -o value -s UUID "$dev" 2>/dev/null || true)"

if [ -z "$uuid_before" ]; then
  reject "no filesystem UUID; media identity is required"
fi
case "$uuid_before" in
  .* | *[!A-Za-z0-9._-]*)
    reject "unsafe filesystem UUID"
    ;;
esac
if [ "${#uuid_before}" -gt 64 ]; then
  reject "unsafe filesystem UUID (too long)"
fi

# Print /dev/<parent disk> for a partition, or the device itself when it has
# no parent (whole disks, loop devices). Fails when lsblk cannot resolve the
# device at all.
parent_disk_of() {
  local device="$1" pkname
  if ! pkname="$(lsblk -no PKNAME "$device" 2>/dev/null | head -n 1 | tr -d '[:space:]')"; then
    return 1
  fi
  if [ -n "$pkname" ]; then
    printf '/dev/%s\n' "$pkname"
  else
    printf '%s\n' "$device"
  fi
}

# --- Gate 1: positive removable-media match -------------------------------

positive_ok=0
case "$name" in
  mmcblk*p*)
    if [ "$match_mmc" = "1" ]; then
      positive_ok=1
    fi
    ;;
esac

if [ "$positive_ok" != "1" ] && [ "$match_usb" = "1" ]; then
  if ! candidate_parent="$(parent_disk_of "$dev")"; then
    reject "could not resolve parent disk for transport check"
  fi
  transport="$(lsblk -ndo TRAN "$candidate_parent" 2>/dev/null | head -n 1 | tr -d '[:space:]' || true)"
  if [ "$transport" = "usb" ]; then
    positive_ok=1
  fi
fi

if [ "$positive_ok" != "1" ]; then
  reject "not operator-swappable removable media (mmc=$match_mmc usb=$match_usb)"
fi

# --- Gate 2: runtime system-disk deny-list --------------------------------

if ! mounts="$(findmnt -rn -o TARGET,SOURCE)"; then
  abort "findmnt could not enumerate mounts"
fi
if [ -z "$mounts" ]; then
  abort "findmnt returned no mounts"
fi

deny_disks=" "
resolved_targets=" "
while read -r target source; do
  [ -n "$target" ] || continue
  [ -n "${source:-}" ] || continue
  case "$source" in
    /dev/*) ;;
    *) continue ;;
  esac
  # Bind mounts report the device with a subdirectory suffix: /dev/sda1[/sub].
  source="${source%%\[*}"
  if ! disk="$(parent_disk_of "$source")"; then
    abort "could not resolve parent disk for mount source $source"
  fi
  case "$deny_disks" in
    *" $disk "*) ;;
    *) deny_disks="$deny_disks$disk " ;;
  esac
  resolved_targets="$resolved_targets$target "
done <<EOF
$mounts
EOF

if [ "$deny_disks" = " " ]; then
  abort "derived system-disk deny-list is empty"
fi

for required in $required_system_mounts; do
  case "$resolved_targets" in
    *" $required "*) ;;
    *) abort "required system mount $required did not resolve to a block-backed disk" ;;
  esac
done

if ! candidate_disk="$(parent_disk_of "$dev")"; then
  abort "could not resolve candidate parent disk"
fi
case "$deny_disks" in
  *" $candidate_disk "*)
    reject "parent disk $candidate_disk backs a system mount"
    ;;
esac

# --- TOCTOU guard ----------------------------------------------------------

uuid_after="$(blkid -o value -s UUID "$dev" 2>/dev/null || true)"
if [ "$uuid_after" != "$uuid_before" ]; then
  reject "device identity changed while matching (uuid '$uuid_before' -> '$uuid_after')"
fi

printf '%s\n' "$uuid_after"
