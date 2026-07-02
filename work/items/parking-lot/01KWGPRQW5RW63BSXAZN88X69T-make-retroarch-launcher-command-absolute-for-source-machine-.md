---
id: 01KWGPRQW5RW63BSXAZN88X69T
slug: make-retroarch-launcher-command-absolute-for-source-machine-
title: Make RetroArch launcher command absolute for source-machine streaming
origin: parked
status: To Do
priority: high
labels:
  - korri
  - retroarch
  - source-machine
  - streaming
  - launch-intent
created: 2026-07-02
source: se-debug
---

# Make RetroArch launcher command absolute for source-machine streaming

## Why it matters

Streaming a RetroArch game from a source machine fails at peer prepare with 'LaunchSpec.command must be absolute'. The @korri:retroarch plugin projects the launcher with command: "retroarch" (PATH-relative), which is fine for local kiosk launches (PATH-resolved at spawn) but the source-machine stream-prepare writes a launch intent validated by assertAbsoluteLaunchSpec, which rejects non-absolute commands. This silently breaks GUI-driven RetroArch stream launches (the launch reaches the peer and is rejected at prepare). Standalone starter-kit launchers avoid this only because they use /run/current-system/sw/bin/nix (absolute).

## Acceptance Criteria

- [ ] @korri:retroarch (and other PATH-relative plugin launchers) resolve to an absolute command usable by source-machine stream-prepare
- [ ] A GBA RetroArch entry streams from a source machine without a per-host launcher override
- [ ] assertAbsoluteLaunchSpec no longer rejects the projected retroarch launcher

## Related

- `product/plugins/retroarch/src/plugin.ts`
- `product/services/device/game-stream-launch-intent.ts`
- `product/apps/portal/api/library/launch.rpc-handler.ts`
