---
id: 01KT2T2J1JPMTQ0374QPEDJ48S
slug: validate-gamescope-fsr-with-reliable-evidence
title: Validate Gamescope FSR with reliable evidence
origin: parked
legacy: task-089
status: To Do
priority: medium
labels:
  - gamescope
  - fsr
  - streaming
  - validation
created: 2026-06-02
source: user
---

# Validate Gamescope FSR with reliable evidence

## Why it matters

The earlier Super+U experiment likely sent literal input to the game instead of proving Gamescope toggled FSR. FSR claims need forced-launch or Gamescope-side evidence.

## Acceptance Criteria

- [ ] Compare FSR on/off using controlled Gamescope launch flags rather than unverified hotkeys.
- [ ] Document what happens with no inner -w/-h resolution: Gamescope gives the child the outer mode, so there is no upscaling work.
- [ ] When FSR is claimed, logs or process flags prove -F fsr and --sharpness are active.
- [ ] Screenshots at the same stream resolution/bitrate demonstrate whether FSR changes visible quality.

## Related

- `packages/moonlight-embedded-korri/package.nix`
- `tools/device/game-stream-fullscreen.ts`
- `korri/products/app/stream/moonlight-launcher.ts`

## Notes

Verified command shape: gamescope -f -b -W 1920 -H 1080 -w 640 -h 360 -F fsr --sharpness 0 -- moonlight ... . Without -w/-h, Moonlight output stayed 1920x1080 and FSR had no smaller child surface to upscale.
