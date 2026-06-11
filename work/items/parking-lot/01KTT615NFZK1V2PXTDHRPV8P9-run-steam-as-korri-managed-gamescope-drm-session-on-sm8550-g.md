---
id: 01KTT615NFZK1V2PXTDHRPV8P9
slug: run-steam-as-korri-managed-gamescope-drm-session-on-sm8550-g
title: Run Steam as Korri-managed gamescope DRM session on SM8550 guest
origin: parked
status: To Do
priority: medium
labels:
  - steam
  - sm8550
  - gamescope
  - session
created: 2026-06-11
source: user
---

# Run Steam as Korri-managed gamescope DRM session on SM8550 guest

## Why it matters

Steam under sway/XWayland composition is sluggish (no direct scanout, desktop scaling 1.5, second screen compositing) and games pick display 0 = DSI-1 1240x1080 instead of the main 1920x1080 panel. Gamescope with the DRM backend fixes both: direct scanout performance and authoritative -W/-H geometry. ROCKNIX upstream does exactly this (stops sway, gamescope --backend drm).

## Acceptance Criteria

- [ ] Steam launches via Korri session management under gamescope DRM
- [ ] Games see 1920x1080 as display 0 with both panels configured
- [ ] Perceptible UI fluidity improvement over sway/XWayland path
- [ ] Session restores Korri GUI cleanly on Steam exit

## Notes

gamescope is not installed on the guest today (we vendor gamescope-korri already). Integrate Steam as a Korri launch intent/session: korri-sessiond stops/yields the compositor surface, runs gamescope -W 1920 -H 1080 --backend drm -- steam -gamepadui ..., restores on exit. Interim workaround in use: swaymsg "output DSI-1 disable" + manual window move. Hardware rendering confirmed fine (ANGLE freedreno FD740, Turnip Vulkan) — the slowness is the compositing path, not the GPU.
