---
id: 01KYQ79T3QQ2XKTDVDRWP425FM
slug: preserve-virtual-keyboard-visibility-across-layout-refresh
title: Preserve virtual-keyboard visibility across layout refresh
origin: parked
status: To Do
priority: medium
labels:
  - input
  - virtual-keyboard
  - state
  - bug
created: 2026-07-29
source: se-code-review
context:
  cwd: /home/simonwjackson/code/sandbox/artemis
  branch: spike/korri-shell-webview
  commit: 5df2e338d6d9
  repo: artemis
  invoked_by: se-work U6 review
---

# Preserve virtual-keyboard visibility across layout refresh

## Why it matters

Adversarial U6 review confirmed a pre-existing state bug: a virtual keyboard hidden by the user can reappear after orientation/PiP-related refresh because refreshLayout rebuilds visible elements while Game skips PiP hide handling when shown is already false.

## Acceptance Criteria

- [ ] A hidden KeyBoardController remains hidden after onConfigurationChanged refreshes its layout.
- [ ] Entering and leaving PiP does not reveal a keyboard that was hidden before the transition.
- [ ] A visible keyboard still refreshes and restores correctly across orientation and PiP transitions.
- [ ] Focused tests or a reproducible device smoke cover hidden and visible states.

## Related

- `app/src/main/java/com/limelight/Game.java`
- `app/src/main/java/com/limelight/binding/input/virtual_controller/keyboard/KeyBoardController.java`

## Notes

Found during the OSC deletion review; confirmed pre-existing and not caused by removing the touch gamepad.
