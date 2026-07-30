---
id: 01KYRM9JYT8PE3J7N9RW78HG7G
slug: restore-pointer-input-on-zao-headless-sunshine-streams
title: Restore pointer input on zao headless Sunshine streams
origin: parked
status: To Do
priority: medium
labels:
  - zao
  - sunshine
  - input
created: 2026-07-30
source: se-debug
context:
  cwd: /home/simonwjackson/code/sandbox/korri/.worktrees/feat/zao-host-korrid
  branch: feat/zao-host-korrid
  repo: korri
---

# Restore pointer input on zao headless Sunshine streams

## Why it matters

Neverball now renders and streams correctly from zao, but tablet mouse/pointer input does not reach the Xvfb-hosted game. This limits mouse-driven titles even though the current gamepad-oriented host slice meets its stream-visibility gate.

## Acceptance Criteria

- [ ] Pointer movement and clicks from the Android Artemis client reach applications on zao's headless display.
- [ ] Neverball remains visible and gamepad input continues to work.
- [ ] The headless Sunshine runtime recipe documents or automates any required X11 input setup.

## Related

- `work/items/active/20260729-zao-host-korrid/plan.md`
- `services/korrid/deploy/`
