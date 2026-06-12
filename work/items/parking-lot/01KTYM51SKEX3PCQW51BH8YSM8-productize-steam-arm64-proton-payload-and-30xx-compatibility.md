---
id: 01KTYM51SKEX3PCQW51BH8YSM8
slug: productize-steam-arm64-proton-payload-and-30xx-compatibility
title: Productize Steam ARM64 Proton payload and 30XX compatibility mapping
origin: parked
status: To Do
priority: high
labels:
  - steam
  - fex
  - fresh-install
  - sm8550
created: 2026-06-12
source: se-work
---

# Productize Steam ARM64 Proton payload and 30XX compatibility mapping

## Why it matters

Fresh reinstall testing exposed that Korri seeds only a stub Proton 11 ARM64 compatibility tool. After a full Steam wipe, Steam downloads 30XX and Proton 10, ignores/misses the intended proton11_arm64 mapping, and 30XX launches through unpatched Proton 10 instead of the known-good Proton 11 ARM64 path. This prevents a wipe-and-reinstall from converging without manual backup restore/config editing.

## Acceptance Criteria

- [ ] From empty /var/lib/korri/steam, Steam can install/download 30XX and launch it through Proton 11.0 (ARM64) without copying a preserved backup
- [ ] Proton 11 ARM64 payload is either downloaded/seeded deterministically or the compatibility tool is not registered until the payload exists
- [ ] 30XX AppID 1029210 receives the required proton11_arm64 compatibility mapping in the correct Steam config location/format after login/install
- [ ] Runtime prep applies the three Korri Proton markers before first 30XX launch
- [ ] A fresh reinstall smoke log shows 30XX.exe running under FEX with x86_64 rootfs Freedreno and /dev/dri/renderD128 opened

## Related

- `product/vendor/steam-korri/scripts/steam-arm64-seed`
- `product/vendor/steam-korri/scripts/steam-guest-runtime-prep`
- `product/systems/nixos/modules/korri-steam.nix`
- `work/items/parking-lot/01KTY23NKJB1K8K911KTHGKZK2-harden-steam-korri-first-run-seeding-and-bootstrap-workflow.md`

## Notes

Observed during bandai wipe test on 2026-06-12: missing Proton 11 ARM64 payload caused 'proton: No such file or directory'; restoring payload from backup plus fixing pressure-vessel wrappers got further, but Steam still selected proton_10 for AppID 1029210. Avoid relying on live editing config.vdf while Steam is running; identify the correct persisted mapping path/format.
