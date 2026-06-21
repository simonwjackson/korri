---
id: 01KVGQ6E5DZDYXQ5V89KSFP8RF
slug: guard-rocknix-update-staging-against-low-storage-headroom
title: Guard ROCKNIX update staging against low STORAGE headroom
origin: parked
status: To Do
priority: high
labels:
  - rocknix
  - sobo
  - update-safety
created: 2026-06-19
source: user
---

# Guard ROCKNIX update staging against low STORAGE headroom

## Why it matters

Sobo recovered only after fastboot-flashing the ROCKNIX partition; the likely trigger was staging a 3.3 GiB update tar on nearly-full STORAGE, leaving too little scratch space for ROCKNIX's update service. A preflight would prevent failed/partial update boots and avoid needing fastboot recovery.

## Acceptance Criteria

- [ ] Update/deploy instructions or scripts compute staged artifact size and available /storage space before copying to /storage/.update.
- [ ] The updater refuses or warns before reboot when free space is below a conservative threshold, e.g. staged tar size plus documented scratch margin.
- [ ] Recovery notes document fastboot flashing only the ROCKNIX partition as the non-bootloader repair path for SM8550.

## Related

- `../nix-on-rocks/scripts`
- `../nix-on-rocks/docs`
- `github-artifacts/nix-on-rocks-upright-odin2portal/nix-on-rocks-build-manifest.md`

## Notes

Observed during Sobo/Odin2Portal upright display update. /storage was initially 100%; GC freed ~2.1 GiB, giving ~4.3 GiB before staging a 3.3 GiB tar. The post-reboot screen showed systemd-ish errors and host SSH was unavailable until fastboot ROCKNIX partition repair.
