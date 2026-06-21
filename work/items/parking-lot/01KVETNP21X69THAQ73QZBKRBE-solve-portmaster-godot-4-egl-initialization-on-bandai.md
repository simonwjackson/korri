---
id: 01KVETNP21X69THAQ73QZBKRBE
slug: solve-portmaster-godot-4-egl-initialization-on-bandai
title: Solve PortMaster Godot 4 EGL initialization on Bandai
origin: parked
status: In Progress
priority: high
labels:
  - portmaster
  - bandai
  - godot4
  - egl
created: 2026-06-19
source: se-debug
context:
  branch: feat/portmaster-godot4-runtime
  commit: 98fbf070
  repo: korri
---

# Solve PortMaster Godot 4 EGL initialization on Bandai

## Why it matters

The packaged Weston/Xwayland substrate now reaches a live Xwayland WM and starts Godot, but Godot exits before rendering because its OpenGLES/EGL path cannot initialize on Bandai. This blocks the final quiet render proof for Godot 4 PortMaster entries.

## Acceptance Criteria

- [ ] Bandai launch log for mrplatformer.zip reaches Godot without `ERROR: Can't load EGL` or `Could not initialize OpenGLES`.
- [ ] A screenshot or log proof shows the Godot 4 PortMaster entry rendered or reached a clean playable window.
- [ ] The fix remains plugin-owned/runtime-owned and does not add PortMaster-specific knowledge to Korri core.

## Related

- `product/plugins/portmaster/packages/portmaster-weston-runtime/default.nix`
- `product/plugins/portmaster/packages/portmaster-weston-runtime/check.nix`
- `work/items/parking-lot/01KVEMD5RQPFJRPW2ZWBWK1Q9R-capture-quiet-bandai-godot-4-portmaster-render-proof.md`
