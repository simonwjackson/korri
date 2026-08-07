---
id: 01KZBYHCA4R9C8QK131HK0VWSA
slug: prove-android-external-emulator-death-without-timeout-retire
title: Prove Android external-emulator death without timeout retirement
origin: parked
status: To Do
priority: high
labels:
  - android
  - retroarch
  - lifecycle
  - security
created: 2026-08-06
source: se-debug
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: feat/unified-android-game-overlay
  repo: korri
---

# Prove Android external-emulator death without timeout retirement

## Why it matters

Android 14 did not provide reliable cross-package process identity through the current ActivityManager continuity monitor. Abrupt RetroArch force-stop leaves the exact launch conservatively unavailable rather than stale; retiring on UDP timeout alone could permit overlapping live sessions.

## Acceptance Criteria

- [ ] Demonstrate a trustworthy positive death signal for the exact launched RetroArch process/authority on Android 14
- [ ] Clear only the matching active launch after that positive signal
- [ ] Retain ActiveSessionConflict for merely suspended or transiently unreachable sessions
- [ ] Add physical-device acceptance for abrupt emulator death and replacement safety

## Related

- `clients/android/app/src/main/java/com/limelight/korri/overlay/KorriLaunchContinuity.java`
- `plugins/retroarch/android/device-acceptance.sh`
- `work/items/active/01KYTRBJ7758KAZ56XHFE1C8BR-unified-android-game-overlay/work.md`
