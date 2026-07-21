---
id: 01KY3GKE078F1HBBJG92F4YEM1
slug: flinthook-steam-fex-hangs-black-at-startup-on-anon-pipe-read
title: Flinthook (Steam/FEX) hangs black at startup on anon_pipe_read before rendering
origin: parked
status: To Do
priority: medium
labels:
  - sm8550
  - steam
  - proton
  - fex
  - gamescope
  - crash
  - intermittent
created: 2026-07-21
source: se-debug
---

# Flinthook (Steam/FEX) hangs black at startup on anon_pipe_read before rendering

## Why it matters

Steam games under gamescope-korri + proton-cachyos-arm64 + FEX are intermittently unplayable: the same game launch either instant-exits (~6s, no error signature) or hangs on a black screen. When black, the game process is alive but State=S (sleeping) blocked in wchan=anon_pipe_read, GPU idle (renderD128 0 clients, 220MHz), no GL/Vulkan context created and zero FNA3D/SDL/GL output -- i.e. it never reaches rendering init. This is a startup handshake race, not a placement/gamescope-abort issue (the window is correctly fullscreen 1920x1080 on korri:steam-debug; workspace reconcile fix ee3e1cfc works). Makes the handheld unreliable for its primary purpose even though the same title has run successfully multiple times.

## Acceptance Criteria

- [ ] Identify which pipe Flinthook.exe blocks on (fd/peer): correlate the anon_pipe_read fd to its writer -- Steam overlay (gameoverlayrenderer.so) handshake, proton/pressure-vessel wrapper, or FEX thunk.
- [ ] Fix the malformed input-guard LD_PRELOAD: Steam concatenates its ubuntu12_32/gameoverlayrenderer.so with /nix/store/.../libkorri-steam-input-guard.so WITHOUT a colon, so BOTH the overlay and the guard fail to preload. Restore proper colon separation (understand Steam's per-arch LD_PRELOAD prepend so our guard does not corrupt the overlay entry). Verify gameoverlayrenderer.so loads and libkorri-steam-input-guard.so loads.
- [ ] Determine if a missing/failed Steam overlay handshake is the source of the anon_pipe_read hang; test with overlay disabled vs fixed-and-loaded.
- [ ] Reproduce deterministically (currently intermittent, correlates with cold boot / cold vkd3d-proton.cache) and confirm a fix across cold and warm launches on a clean boot with NO live compositor poking.
- [ ] Cross-check against gamescope-korri 3.16.23 vs stock 3.16.17 and the wl_touch backend patch 0004 as possible destabilizers.
- [ ] Validate: launch Flinthook (and one other title) from cold boot and have it render + be playable, with the workspace reconcile keeping it on korri:steam-debug.

## Related

- `product/plugins/steam/nix/nixos-module.nix`
- `docs/plans/2026-07-21-001-fix-steam-fex-gamescope-launch-cluster-plan.md` (epic; this is symptom S1/S2, the best-instrumented case)
- `01KWGHXF36` (nested gamescope-korri SIGABRT / symptom S3; 01KY3CACRF was folded into it)
- `01KVHC64M78S` (FEZ short-lived exit -- same S1 class, FNA+Proton+FEX)
- `01KVHBZ2BB8Z` (VVVVVV instant exit -- same S1 class, native x86 SDL+FEX)
- `01KVDZ7JFJ3M80` (Street Fighter X Mega Man black screen -- same S2 class, Wine)
