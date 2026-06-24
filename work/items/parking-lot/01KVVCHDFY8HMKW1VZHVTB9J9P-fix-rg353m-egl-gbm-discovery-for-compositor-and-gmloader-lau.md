---
id: 01KVVCHDFY8HMKW1VZHVTB9J9P
slug: fix-rg353m-egl-gbm-discovery-for-compositor-and-gmloader-lau
title: Fix RG353M EGL/GBM discovery for compositor and GMLoader launches
origin: parked
status: To Do
priority: high
labels:
  - rg353m
  - egl
  - gmloader
  - compositor
created: 2026-06-23
source: stargrove-gmloader-spike
---

# Fix RG353M EGL/GBM discovery for compositor and GMLoader launches

## Why it matters

After a hard reboot, Sway failed to create a GLES renderer and GMLoader could not create SDL/EGL windows until Mesa GLVND and GBM paths were supplied explicitly. This makes performance testing fragile and can make native ports appear broken even when the game/runtime is fine.

## Acceptance Criteria

- [ ] korri-compositor.service starts normally after hard reboot with GLES2/Panfrost on RG353M
- [ ] EGL clients find Mesa without ad-hoc __EGL_VENDOR_LIBRARY_FILENAMES, GBM_BACKENDS_PATH, or LIBGL_DRIVERS_PATH exports
- [ ] GMLoader launches on Wayland after reboot without manual compositor restart

## Related

- `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- `product/plugins/gamescope/nix/platform-environments.nix`
- `product/plugins/portmaster/packages/gmloader-port/default.nix`
