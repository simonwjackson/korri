---
id: 01KYTRBJ7758KAZ56XHFE1C8BR
slug: build-korri-overlay-service-scoped-to-korri-launched-session
title: Build Korri overlay service scoped to Korri-launched sessions
origin: parked
status: To Do
priority: medium
labels:
  - android
  - overlay
  - input
  - session-lifecycle
  - korri-shell
  - cross-transport
created: 2026-07-31
source: se-brainstorm
context:
  cwd: artemis
  branch: custom
  commit: cf12c432
  repo: artemis
  invoked_by: user
---

# Build Korri overlay service scoped to Korri-launched sessions

## Why it matters

The in-process overlay trick that works for Artemis (dispatchKeyEvent + WebView inside the Game activity) does not generalise: it requires forking every emulator, which is explicitly against policy for GameNative (separate APK, intent-driven, never embed) and impractical for Dolphin, Vita3K, and whatever ships next year. Without a universal solution, the Guide button silently does nothing outside the transports we happen to control, breaking the single-app illusion the whole Korri shell exists to create. One accessibility service plus one system-overlay window delivers Guide-summons-Korri over every transport including ones with zero cooperation, and the same window-state events double as the session-presence feed that answers "is the game running" for all transports at once — a capability currently missing everywhere except aka.

## Acceptance Criteria

- [ ] Accessibility service captures KEYCODE_BUTTON_MODE (Guide) globally
- [ ] Service is ARMED only when a Korri session is active AND the foreground package matches that session's package; otherwise the key event passes through completely untouched
- [ ] Launching an emulator directly from the Android launcher (no Korri session record) leaves Guide behaviour totally unchanged
- [ ] System overlay window (TYPE_APPLICATION_OVERLAY) hosts the same overlay.html contract as the Artemis in-process overlay — player cannot tell which transport they are on
- [ ] Verified working over: RetroArch, Dolphin, GameNative, and the Artemis stream path
- [ ] Overlay actions dispatch per-transport: korrid RPC for streams, RA command channel for RA, finish/relaunch semantics for standalones
- [ ] Window-state-change events feed session presence (active / backgrounded / ended) to the shell banner for every transport
- [ ] Samsung battery management configured so the service is not killed in the background
- [ ] Overlay taking focus pauses the underlying emulator (verify per transport) and returns input cleanly on dismiss

## Related

- `app/src/main/java/com/limelight/KorriGameOverlay.java`
- `app/src/main/assets/korri-shell/overlay.html`
- `app/src/main/java/com/limelight/binding/input/ControllerHandler.java`
- `app/src/main/java/com/limelight/Game.java`

## Notes

## Why this shape

Three options were considered:
1. **In-process per app** (current Artemis approach) — best UX, but a fork treadmill; dead on arrival for Dolphin/GameNative.
2. **System overlay + accessibility service** — universal, zero per-app work, two one-time permission grants. **Chosen.**
3. **Do nothing** — Guide dead during local play; exit via app switching only.

## Scoping logic (this is the key design decision)

The Android *permission* is device-wide (there is no per-app accessibility grant), but the *behaviour* is ours to scope:

```
armed = (active Korri session exists)
        AND (foreground package == that session's package)

Guide pressed:
  armed   -> consume event, show overlay
  unarmed -> return false, event passes through untouched
```

- **Arm on launch**: the shell already knows what it launched (package, title, transport, started-at) — set the session record there.
- **Disarm on end**: cleared when the shell resumes, the process dies, or the user quits from the overlay.
- Result: no Guide-button tax anywhere outside Korri sessions. Addresses the user's explicit constraint ("I only want it for games launched with korri").

## Two-for-one with session detection

Accessibility services receive window-state-change events *with package names*, so the service always knows what is foreground. That is a better session-presence feed than the alternatives evaluated:
- UsageStatsManager polling (needs its own special permission, coarser)
- SRAM mtime heuristic (needs storage grant, only says "alive-ish")
- RA GET_STATUS (only works for the forked RA, useless for Dolphin/GameNative)

This service becomes the Android analog of sessiond: it tracks the one foreground session Korri owns, feeds the shell banner, and holds the Guide key.

## Context: what the overlay already is on the Artemis side

Guide → `overlay.html` in a WebView over the stream. Getting the toggle working required three layers (documented in the earlier session): open on Guide *release* not press; a WebView OnKeyListener because Chromium swallowed gamepad keys; and finally an activity-level `dispatchKeyEvent` override, since ViewGroup dispatches straight to Chromium's focused internal child and skips the parent listener. Expect similar focus-stealing subtleties in the system-overlay version.

## Permissions required (one-time, user-granted)

- Display over other apps (`SYSTEM_ALERT_WINDOW`)
- Accessibility service with key-event filtering

Acceptable on personal devices; invisible on a dedicated Korri device provisioned as device owner.

## Scope reduction elsewhere

If this lands, the com.korri.retroarch fork does not need its own in-process overlay, shrinking that item to only fork-unique capabilities.
