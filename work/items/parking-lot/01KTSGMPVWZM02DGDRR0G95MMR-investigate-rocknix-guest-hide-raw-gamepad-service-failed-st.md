---
id: 01KTSGMPVWZM02DGDRR0G95MMR
slug: investigate-rocknix-guest-hide-raw-gamepad-service-failed-st
title: Investigate rocknix-guest-hide-raw-gamepad.service failed state with empty journal
origin: parked
status: To Do
priority: medium
labels:
  - rocknix-sm8550
  - input
created: 2026-06-10
source: se-debug
context:
  branch: trunk
  repo: korri
  invoked_by: bandai sleep-health investigation 2026-06-10
---

# Investigate rocknix-guest-hide-raw-gamepad.service failed state with empty journal

## Why it matters

The unit shows failed on every Bandai boot with no journal entries, so we cannot tell whether raw gamepad nodes are actually being hidden after InputPlumber claims them. If hiding silently fails, apps could read the raw gamepad alongside the normalized InputPlumber virtual device, causing double-input bugs.

## Acceptance Criteria

- [ ] Root cause of the failed state identified and fixed or documented
- [ ] Unit logs its actions to journald so future failures are diagnosable
