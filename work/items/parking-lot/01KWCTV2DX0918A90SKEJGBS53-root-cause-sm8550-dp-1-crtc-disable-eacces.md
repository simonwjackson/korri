---
id: 01KWCTV2DX0918A90SKEJGBS53
slug: root-cause-sm8550-dp-1-crtc-disable-eacces
title: Root-cause SM8550 DP-1 CRTC disable EACCES
origin: parked
status: To Do
priority: high
labels:
  - sm8550
  - display
  - dp-hotplug
  - kernel
  - wlroots
created: 2026-06-30
source: se-debug
---

# Root-cause SM8550 DP-1 CRTC disable EACCES

## Why it matters

The 20260630 host upgrade and two wlroots patch attempts proved that neither the upstream ROCKNIX MSM resource-cleanup patch nor simple wlroots CRTC state fixes resolve runtime external-display unplug/replug. Keeping the investigation explicit prevents us from treating the failed patch as a solution while preserving the evidence needed for a kernel-level follow-up.

## Acceptance Criteria

- [ ] A minimal reproducer identifies the exact MSM/DPU atomic-check path returning EACCES when disabling DP-1 CRTC 109.
- [ ] The fix is either an upstreamable kernel patch or an upstreamable wlroots workaround with a successful on-device unplug/replug/replug validation without compositor restart.
- [ ] The temporary compositor-restart workaround, if added, is clearly labeled and removable after the root fix lands.
- [ ] Failed experimental patches from 2026-06-30 are not carried in maintained branches unless independently justified.

## Related

- `nix-on-rocks@09ea549`
- `nix-on-rocks/.github/workflows/build-sm8550.yml run 28422578253`
- `work/items/parking-lot/01KWATDTP57HPHHBRJKF0XDZ4N`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `patches/rocknix/0023-sm8550-msm-resource-cleanup.patch`

## Notes

Observed on bandai after ROCKNIX OS_VERSION=20260630: unplug active DP-1 logs `connector DP-1: Atomic commit failed: Permission denied` and `Failed to disable CRTC 109`; replug leaves kernel connected but Sway inactive until compositor restart. Live-tested WLR_DRM_NO_ATOMIC=1 (not viable), wlroots allow-reconfiguration patch, and wlroots CRTC-pointer cleanup patch; none fixed behavior.
