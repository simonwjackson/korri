---
id: 01KY17HAKTVCX782SYPH347KA8
slug: upstream-wl-touch-wayland-backend-patch-to-valvesoftware-gam
title: Upstream wl_touch Wayland-backend patch to ValveSoftware/gamescope
origin: parked
status: To Do
priority: medium
labels:
  - gamescope
  - upstream
  - touch
created: 2026-07-21
source: se-debug
---

# Upstream wl_touch Wayland-backend patch to ValveSoftware/gamescope

## Why it matters

Patch 0004 fixes upstream issue #1606 (nested Wayland backend drops all touchscreen input). Upstreaming removes our carry burden on future gamescope rebases and benefits every nested-gamescope touch device; the patch is self-contained and mirrors existing pointer-handler structure, so it is a plausible upstream candidate.

## Acceptance Criteria

- [ ] PR opened against ValveSoftware/gamescope referencing issue #1606
- [ ] gamescope-korri patch list notes the upstream PR status

## Related

- `product/plugins/gamescope/packages/gamescope-korri/patches/0004-waylandbackend-forward-wl-touch-input.patch`
