---
id: 01KV61NG0CZ35D01YWZTW80CR5
slug: revisit-per-game-steam-launchoptions-wrapper-support
title: Revisit per-game Steam LaunchOptions wrapper support
origin: parked
status: To Do
priority: medium
labels:
  - steam
  - gamescope
  - parking-lot
  - decommission
created: 2026-06-15
source: live-bandai-spike
---

# Revisit per-game Steam LaunchOptions wrapper support

## Why it matters

Live Bandai spikes showed the custom Korri per-game LaunchOptions wrapper is incomplete and less critical than Steam-inside-Gamescope for Stray/controller stability, but the work contains useful preservation/diagnostic lessons that should not be lost.

## Acceptance Criteria

- [ ] A future design decides when per-game LaunchOptions wrapping is supported versus explicitly disabled.
- [ ] Existing wrapper/planner work is recoverable from docs/tests/parking-lot references without being wired into active launch paths.
- [ ] Per-game wrapper support preserves existing Steam LaunchOptions and unknown per-app Steam state before any rollout.

## Related

- `tools/device/steam/korri-steam-gamescope-launch.sh`
- `product/services/device/steam/steam-gamescope-launch-plan.ts`
- `product/services/device/steam/steam-gamescope-launch-planner-cli.ts`
- `work/items/active/01KV3E8VXKVYD86C5YTDQ1GKMF-productize-steam-ts-planner-handoff/work.md`
