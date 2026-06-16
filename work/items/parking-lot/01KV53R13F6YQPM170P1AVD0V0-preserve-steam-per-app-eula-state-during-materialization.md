---
id: 01KV53R13F6YQPM170P1AVD0V0
slug: preserve-steam-per-app-eula-state-during-materialization
title: Preserve Steam per-app EULA state during materialization
origin: parked
status: To Do
priority: medium
labels:
  - steam
  - gamescope
  - materializer
  - ux
created: 2026-06-15
source: live-bandai-spike
---

# Preserve Steam per-app EULA state during materialization

## Why it matters

Sonic Mania showed a Steam EULA prompt despite prior play history, and the prompt blocked warm-launch timing inside Gamescope where pointer clicks did not reach the Steam UI. Losing or failing to preflight per-app acceptance state can strand users in unclickable Steam dialogs.

## Acceptance Criteria

- [ ] Steam materialization preserves existing per-app EULA/first-run keys such as Sonic Mania 584400 when rewriting app blocks.
- [ ] Warm-launch diagnostics flag pending Steam modal/EULA blockers before timing a game launch.
- [ ] A regression test covers preserving unknown per-app Steam localconfig keys alongside LaunchOptions.

## Related

- `/var/lib/korri/steam/userdata/80924811/config/localconfig.vdf`
- `product/platform/library/config/steam-state-materializer.ts`
- `work/items/active/01KV3E8VXKVYD86C5YTDQ1GKMF-productize-steam-ts-planner-handoff/work.md`
