---
id: 01KWGHXF36Z8YSP27B8MHD0ZKG
slug: investigate-nested-gamescope-iwaitable-hung-up-abort-on-moon
title: "Investigate nested gamescope 'IWaitable hung up' abort on Moonlight launch"
origin: parked
status: To Do
priority: high
labels:
  - korri
  - gamescope
  - moonlight
  - crash
  - sm8550
created: 2026-07-02
source: se-debug
---

# Investigate nested gamescope 'IWaitable hung up' abort on Moonlight launch

## Why it matters

The gamescope-korri 3.16.23 nested compositor wrapping Moonlight intermittently aborts with SIGABRT ('IWaitable hung up. Aborting.') shortly after the v4l2m2m decoder initializes. It reproduced on both Bandai (client) and aka (source-side) gamescope. When it fires it kills Moonlight/the stream. The trigger is not yet identified from logs; a preceding 'Failed to bind socket @/tmp/.X11-unix/X0: Address already in use' is only a benign fallback (collision with the compositor's own Xwayland :0). Manual runs with forced -codec h264 + fixed 720p have not reproduced it; the crashed runs negotiated HEVC via codec=auto. Needs isolation.

## Acceptance Criteria

- [ ] Root trigger of 'IWaitable hung up. Aborting.' is identified (fd/waitable that hangs up)
- [ ] Determine whether codec auto->HEVC vs forced h264 changes crash rate
- [ ] A reproducible minimal case or a fix/guard is documented

## Related

- `product/vendor/moonlight-embedded-korri/package.nix`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `product/plugins/gamescope`
