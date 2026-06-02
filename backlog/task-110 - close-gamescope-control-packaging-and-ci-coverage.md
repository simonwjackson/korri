---
id: task-110
title: Close Gamescope control packaging and CI coverage
status: To Do
priority: medium
labels:
  - gamescope
  - nix
  - packaging
  - ci
  - runtime-control
created: 2026-06-02
source: user
---

# Close Gamescope control packaging and CI coverage

## Why it matters

The additive gamescope-korri package lane exists, but reproducible deployment needs CI/build checks and runtime dependency coverage so the bridge tools are present on devices without replacing stock Gamescope.

## Acceptance Criteria

- [ ] Add CI/eval/build coverage for the additive gamescope-korri package lane without replacing stock pkgs.gamescope.
- [ ] Ensure bridge and CLI runtime dependencies such as xprop, xrandr, and xwininfo are included where the control bridge runs.
- [ ] Document the relationship between stock Gamescope, gamescope-korri, and the out-of-tree control bridge.
- [ ] Verify package availability and runtime closure on the target device profile.

## Related

- `flake.nix`
- `nix/overlays/korri-packages.nix`
- `packages/gamescope-korri/package.nix`
- `packages/gamescope-korri/patches/README.md`
- `tools/cli/gamescope-control.ts`
- `tools/cli/gamescope-control-bridge.ts`
- `backlog/task-103 - build-full-gamescope-rpc-control-api.md`

## Notes

PR phase 6. This keeps the Gamescope lane additive and makes deployment reproducible.
