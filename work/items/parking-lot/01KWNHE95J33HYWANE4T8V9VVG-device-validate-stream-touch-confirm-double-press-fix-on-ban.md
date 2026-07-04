---
id: 01KWNHE95J33HYWANE4T8V9VVG
slug: device-validate-stream-touch-confirm-double-press-fix-on-ban
title: Device-validate stream-touch + confirm double-press fix on Bandai
origin: parked
status: To Do
priority: high
labels:
  - chord
  - overlay
  - device-validation
  - stream
  - inputplumber
created: 2026-07-04
source: se-work
---

# Device-validate stream-touch + confirm double-press fix on Bandai

## Why it matters

Both remaining chord items are code-complete and deployed but need finger-on-glass / controller validation I can't do headless. Stream-touch: strong code evidence it already works with zero extra code (Bandai's stream policy passes only the InputPlumber gamepad to Moonlight's -input; moonlight-embedded disables udev auto-grab when -input is given, so it never EVIOCGRABs the ft5x06 panels — the compositor keeps them and the Push A wl_touch renderer should receive touch above the fullscreen stream, which Spike B proved renders on top). If validation shows Moonlight DOES grab the panels, the fallback is a Moonlight local-control input.suspend/resume (EVIOCGRAB toggle via a self-pipe on the evdev loop) driven by inputd on overlay open/close. Double-press: shipped a fix that defers drawing the menu until InterceptMode 2 is confirmed (removes the busctl round-trip race). If it persists, it's an InputPlumber-internal first-event-drop on the 0->2 transition; levers found on CompositeDevice0: SendEvent (sv) / SendButtonChord (as) to prime/absorb the dropped first event, and SetInterceptActivation (ass) for native chord->intercept. A resting PASS (mode 1) keeps the dbus target warm but intercepts Guide (risky).

## Acceptance Criteria

- [ ] On a live Bandai->aka stream, tapping a menu button on the touchscreen selects/confirms it (stream-touch)
- [ ] If stream-touch fails, confirm via fuser whether Moonlight grabs /dev/input/event4+event5 during the stream, then implement the Moonlight input.suspend/resume fallback
- [ ] A single accept press on a freshly-opened menu registers (no double-press) on both local and stream sessions
- [ ] If double-press persists, monitor dbus0 while pressing A to confirm the first-event-drop, then prime via SendEvent after InterceptMode 2

## Related

- `work/items/active/01KWMNX6R2N1BNCY124TWH94XF-stream-game-lifecycle-chord/plan.md`
- `product/services/device/overlay-orchestrator.ts`
- `product/services/device/overlay-renderer/renderer.c`
- `product/services/device/overlay-session-state.ts`
