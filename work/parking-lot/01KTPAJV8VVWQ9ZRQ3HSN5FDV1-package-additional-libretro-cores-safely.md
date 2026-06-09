---
id: 01KTPAJV8VVWQ9ZRQ3HSN5FDV1
slug: package-additional-libretro-cores-safely
title: "Package additional libretro cores safely"
origin: parked
legacy: backlog/task-075
status: To Do
priority: low
labels:
  - "retroarch"
  - "nix"
  - "cores"
created: 2026-06-08
source: se-challenge-plan
---

# Package additional libretro cores safely

## Why it matters

The full RetroArch config direction may require more cores, but the active plan explicitly avoids core packaging. New cores must preserve the symlinkJoin pattern so wrapper-injected -L/appendconfig ambiguity does not regress.

## Acceptance Criteria

- [ ] Identify which additional libretro cores are product-supported.
- [ ] Package each supported core with the existing symlinkJoin/no-wrapper pattern.
- [ ] Expose stable core paths and extend Nix guard tests so wrapper-injected launch authority cannot return.

## Related

- `docs/plans/2026-06-08-004-feat-full-retroarch-config-plan.md`
- `docs/solutions/runtime-errors/retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27.md`
- `product/systems/nixos/images/kiosk.nix`
- `tools/testing/nix/korri-retroarch-xdelta-check.nix`
