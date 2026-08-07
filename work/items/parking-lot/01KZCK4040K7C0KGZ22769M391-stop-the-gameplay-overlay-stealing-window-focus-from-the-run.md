---
id: 01KZCK4040K7C0KGZ22769M391
slug: stop-the-gameplay-overlay-stealing-window-focus-from-the-run
title: Stop the gameplay overlay stealing window focus from the running game
origin: parked
status: To Do
priority: medium
labels:
  - android
  - overlay
  - ux
  - input
created: 2026-08-06
source: se-debug
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: feat/unified-android-game-overlay
  repo: korri
---

# Stop the gameplay overlay stealing window focus from the running game

## Why it matters

The global overlay requests Android focus after attach so controller generic-motion (stick/hat) reaches its listeners. The focused accessibility overlay makes the game window lose focus, and RetroArch pauses rendering while unfocused, producing the measured blank/reappear/slide-in flicker on every Guide press. On Android 14 the service can instead consume motion via AccessibilityService.onMotionEvent with setMotionEventSources, keeping the overlay non-focusable.

## Acceptance Criteria

- [ ] Guide opens the sheet with no blank frame over local RetroArch or a live stream
- [ ] D-pad, A, B, stick and hat still work with no touchscreen
- [ ] Overlay window no longer takes focus from the game window
- [ ] No input reaches gameplay while the sheet is open
- [ ] Installed-device evidence captures the before/after behaviour

## Related

- `clients/android/app/src/main/java/com/limelight/korri/overlay/KorriOverlayService.java`
- `work/items/active/01KYTRBJ7758KAZ56XHFE1C8BR-unified-android-game-overlay/work.md`
