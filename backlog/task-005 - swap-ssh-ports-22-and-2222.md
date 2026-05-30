---
id: task-005
title: Swap SSH ports 22 and 2222
status: To Do
priority: low
labels:
  - networking
  - ssh
  - device
created: 2026-05-29
source: user
---

# Swap port 22 & 2222

## Context

Today the stock-OS SSH lives on one port and the Korri/RockNix-guest SSH lives on the other. Swap them so the Korri runtime owns port 22 and the legacy/stock SSH listens on 2222 (or vice versa — confirm desired direction at promotion time).

## Why it matters

Whichever port Korri owns becomes the default for tooling, deploy scripts, `just device-*` recipes, and human muscle memory. Putting the primary runtime on the well-known port reduces friction in every device interaction and avoids per-command port flags.

## Acceptance Criteria

- [ ] Confirm direction (Korri on 22, stock on 2222) at promotion time.
- [ ] Device SSH configuration updated in the relevant Nix module / image.
- [ ] `just device-*` recipes and any committed tooling no longer hard-code the non-default port for the Korri side.
- [ ] Live-USB VM smoke / device smoke still pass.
- [ ] Migration note for any operator with the old port baked into local config (ignored local env / shell rc).

## Related

- `tools/device/*`
- `nix/modules/*`
- `nix/images/platforms/rocknix-sm8550.nix`

## Notes

Trivial to implement, easy to break tooling. Promote to `se-work` only once direction is confirmed.
