---
id: 01KY3AF010P0HZKQS7AYYX6ZEH
slug: persist-guest-storage-outside-the-swappable-rootfs-on-sm8550
title: "Persist guest /storage outside the swappable rootfs on SM8550 so upgrades don't wipe user data"
origin: parked
status: To Do
priority: high
labels:
  - sm8550
  - nix-on-rocks
  - data-loss
  - substrate
created: 2026-07-21
source: user
---

# Persist guest /storage outside the swappable rootfs on SM8550 so upgrades don't wipe user data

## Why it matters

On SM8550 (bandai/thor), the guest's /storage is a plain directory inside the swappable rootfs (GUEST_STORAGE_ROOT="${GUEST_ROOT}/storage"), not a persistent mount. A packaged seed-revision bump shipped in an upgrade triggers rocknix-guest-root-ensure's automatic reseed path (packaged_seed_update_available -> reseed_guest_root), which lays down a fresh seed as current and moves the old rootfs to a throwaway previous. Because /storage lives inside the rootfs, ALL user data (roms, saves, .config, .local, library, /var/lib/korri) is discarded on reseed. This silently violates the contract every consumer already trusts — nix-on-rocks moonlight.nix and Cemu save comments both state /storage "survives rootfs swaps." True on classic SD-card ROCKNIX; false on SM8550 UFS topology (validated on bandai 2026-06-11, rocknix-sm8550.nix:685).

## Acceptance Criteria

- [ ] Guest /storage (or the guest-owned data paths: storage/roms, storage/.config, storage/.local, saves, /var/lib/korri) persists across a packaged-seed-revision reseed on SM8550
- [ ] A seed-revision bump upgrade on bandai/thor no longer discards user data
- [ ] The '/storage survives rootfs swaps' assumption in nix-on-rocks modules holds on SM8550, or those comments are corrected to match reality

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `../nix-on-rocks/work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/scripts/rocknix-guest-root-ensure`
- `../nix-on-rocks/work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/scripts/rocknix-guest-prep`

## Notes

Two fix options: (1) preferred — mount a real persistent /storage over ${GUEST_ROOT}/storage so reseed only replaces the OS rootfs; (2) have reseed_guest_root migrate guest-owned data paths from old current into the new seed instead of only keeping a throwaway previous.
