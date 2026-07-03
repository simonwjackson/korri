---
id: 01KWN2M3GSW2FQST7F3M7RX0V2
slug: add-active-frozen-black-screen-watchdog-with-auto-revert-to-
title: Add active frozen/black-screen watchdog with auto-revert to last known-good
origin: parked
status: To Do
priority: high
labels:
  - runtime-settings
  - reliability
  - safety
  - task-100
  - device-validation
created: 2026-07-03
source: se-work
---

# Add active frozen/black-screen watchdog with auto-revert to last known-good

## Why it matters

task-100. Phase-1 continuity guarantee: if a live change hangs, times out, or leaves a frozen/black screen, the system should auto-revert to the last known-good settings and record the revert (never silent). Today failed/timed-out changes already keep the stream alive on prior settings, and explicit baseline restore exists (Moonlight records launch baseline; restore = normal set commands). The missing piece is an active detector: a resolution change the host applies but the client can't decode strands the user on black. Building the detector (no-frames-after-change → revert) needs real device signals to tune thresholds and must respect the contract (recovery is Korri-side policy, not fork auto-adaptation). Slated to be built with Gate A device feedback.

## Acceptance Criteria

- [ ] A change that produces no decoded frames within a bounded window triggers an automatic revert to the last known-good settings.
- [ ] The revert is recorded in local-control state so it is observable (never silent), consumable by korri stream / runtime-watch.
- [ ] Watchdog thresholds validated on-device against a real frozen/black case.
- [ ] Recovery policy placement respects the contract (Korri-side or client no-frames safety, not fork auto-adaptation).

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `work/parking-lot/01KT2T2J1VBF9ETG4A45D8WBPX-add-runtime-resolution-recovery-fallback.md`
- `01KWN0KHT7CF3YXHWXTSCYMFNS`
