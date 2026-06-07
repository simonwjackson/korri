---
id: task-038
title: Minimize RG353M gamescope patch set after Xwayland routing
status: To Do
priority: medium
labels:
  - gamescope
  - rg353m
  - rk3566
  - maintenance
  - patches
created: 2026-06-07
source: user
---

# Minimize RG353M gamescope patch set after Xwayland routing

## Why it matters

RG353M freezes are fixed by routing RetroArch through Xwayland, so the explicit-sync-disable gamescope patch may no longer be load-bearing. Confirming this empirically could reduce downstream patch maintenance while preserving the proven freeze fix.

## Acceptance Criteria

- [ ] Temporarily drop or disable `product/vendor/gamescope-korri/patches/0002*` and rebuild `gamescope-korri` for the RG353M/RK3566 target.
- [ ] Run the known RG353M repro long enough to match the solved baseline (200s+/12,000+ frames) with Xwayland routing still enabled.
- [ ] If the repro remains stable, remove patch `0002` from the patch set and update checks/docs that assert the patch list.
- [ ] If the repro regresses, keep patch `0002` and document that it remains required even on the Xwayland path.

## Related

- `product/vendor/gamescope-korri/package.nix`
- `product/vendor/gamescope-korri/patches`
- `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- `/tmp/handoff-wTpPGY.md`

## Notes

Handoff says exactly patches 0001 render-only Vulkan, 0002 optional explicit-sync, 0003 optional pipeline-precompile are currently landed. Earlier experimental patches 0004 flush/heartbeat/vblank were tried and reverted and should not be reintroduced. Recommended next skill: se-work.
