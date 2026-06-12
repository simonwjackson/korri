---
id: 01KTWZ0EG83WQTF2DBCXA82WXF
slug: bump-korri-nixpkgs-pin-for-system-wide-mesa-26-turnip-gl
title: Bump korri nixpkgs pin for system-wide mesa 26 (Turnip + GL)
origin: parked
status: To Do
priority: medium
labels:
  - nixpkgs
  - mesa
  - deploy
  - soak
  - sm8550
created: 2026-06-12
source: user
---

# Bump korri nixpkgs pin for system-wide mesa 26 (Turnip + GL)

## Why it matters

Tonight's validated fix runs Turnip 26.1.2 for Ryujinx only (scoped ICD override, 01KTWYHS70). nixpkgs-unstable already ships mesa 26.1.2, so the durable global form is an ordinary flake pin bump — making the scoped override a deletable no-op and moving the whole stack (compositor GL, Cemu, mgba, portal webview) onto one coherent mesa. Risk concentrates in two places: the Freedreno-GL 26 compositor path is completely unproven on this device (tonight only validated the Vulkan half), and the pin bump's non-graphics collateral (bun, dotnet, SDL, ffmpeg, bun-deps hashes, tsc/test baseline drift) needs its own soak — which is why this must ship as its own boring slice, not ride a perf fix.

## Acceptance Criteria

- [ ] Pin bumped to a mesa >= 26.x nixpkgs rev; bun-deps hashes regenerated; full check suite run with baseline drift re-baselined deliberately
- [ ] Deploy via live nixos-rebuild switch with previous generation kept un-GC'd; rollback path confirmed before deploy (power-cycle caveat for guest restarts)
- [ ] Post-deploy device checklist passes: both DSI panels up with correct rotation, no wlroots/EGL errors or dmesg msm faults; Ryujinx logs Driver v26.x WITHOUT VK_ICD_FILENAMES; Cemu parity lap; mgba + portal UI render; MangoHud overlay works
- [ ] Shader-cache recompile stutter on first title launches documented as expected (judge perf on second session)
- [ ] One rocknix-fake-suspend round-trip + one cold boot + long-session dmesg GPU check clean
- [ ] Scoped VK_ICD_FILENAMES override and ryubing mesa pin removed once soaked; MK8/NvDec intro crash re-tested separately on new ffmpeg without contaminating the mesa verdict

## Related

- `docs/solutions/performance-issues/ryubing-sm8550-turnip26-openal-2026-06-11.md`
- `backlog 01KTWYHS706V5M08Z5ZR5NNV6V`
- `tools/nix/bun-deps/default.nix`
