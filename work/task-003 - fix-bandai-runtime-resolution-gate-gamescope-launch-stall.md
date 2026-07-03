---
id: task-003
title: Fix Bandai runtime-resolution gate gamescope launch stall
status: To Do
priority: medium
labels:
  - bandai
  - runtime-resolution
  - gamescope
  - validation
created: 2026-06-09
source: user
---

# Fix Bandai runtime-resolution gate gamescope launch stall

## Why it matters

The Bandai validation harness currently stalls with gamescope running but Moonlight never reaching local-control, forcing direct-Moonlight validation and reducing confidence in the normal gamescope-wrapped path.

## Acceptance Criteria

- [ ] `tools/scripts/live-runtime-resolution-gate.sh` reaches streaming on Bandai through the gamescope-wrapped launcher.
- [ ] Bandai local-control socket appears without manual direct-Moonlight bypass.
- [ ] A 1080p to 720p runtime-resolution smoke produces client captures and Moonlight/Sunshine logs through the standard gate.

## Related

- `tools/scripts/live-runtime-resolution-gate.sh`
- `docs/handoffs/live-runtime-resolution-journey.md`
- `/tmp/live-runtime-resolution-gate/direct-bp-720-170649`

## Notes

Observed during Bandai validation after Aka rootless session work: Bandai compositor had to be started manually, and gamescope wrapper stayed alive but did not exec Moonlight/local-control. Direct Moonlight validation succeeded.
