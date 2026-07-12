---
id: 01KX7NYY82DNBAN06MGDY415XY
slug: harden-stream-teardown-clear-adaptive-loop-and-survive-compo
title: "Harden stream teardown: clear adaptive loop and survive compositor surface errors"
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - streaming
  - reliability
created: 2026-07-11
source: se-debug
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  repo: korri
---

# Harden stream teardown: clear adaptive loop and survive compositor surface errors

## Why it matters

An ungraceful host-side game stop left bandai's korrid adaptive-bitrate loop polling a dead moonlight control socket indefinitely, and the kiosk compositor in a state where every subsequent gamescope launch was killed with 'xdg_wm_base error 4: wrong configure serial' (exit 134) — making new streams impossible until compositor + korrid were manually restarted. Stream teardown should reap the adaptive session when the control socket disappears, and the compositor crash needs a repro/fix so a dropped stream can't brick stream relaunch.

## Acceptance Criteria

- [ ] korrid stops the adaptive dispatch loop within a bounded window after the moonlight control socket vanishes (no ENOENT spam)
- [ ] After an ungraceful stream collapse, a new stream launch succeeds without manually restarting korri-compositor
- [ ] Root cause of the 'wrong configure serial' compositor kill identified or worked around (e.g. gamescope retry/backoff)
