---
id: 01M1FAJABCE7XNZM79PAB4KKNX
title: Restore Korri-owned headless Sway compositor on Zao
status: active
created: 2026-09-01
source: parking-lot
---

# Restore Korri-owned headless Sway compositor on Zao

Replace Zao's software Xvfb display with one Korri-owned headless Sway session. Sunshine captures the compositor output. Inputd sends bounded focus and fullscreen commands for one active game. The client portal remains the only hub.

## Current status

- The plan is written. See `plan.md`.
- Implementation is not started.
- This item graduated from `work/items/parking-lot/`. The original text is in `item.md`.

## Execution tracker

- [ ] U1: Headless capture and boundary spike
- [ ] U2: Compositor session in the Linux host module
- [ ] U3: Game environment and moving gate on Wayland
- [ ] U4: Inputd compositor control action
- [ ] U5: Zao candidate rollout and persistent switch
