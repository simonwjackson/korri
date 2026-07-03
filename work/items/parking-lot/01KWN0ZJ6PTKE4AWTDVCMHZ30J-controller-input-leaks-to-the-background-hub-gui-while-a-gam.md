---
id: 01KWN0ZJ6PTKE4AWTDVCMHZ30J
slug: controller-input-leaks-to-the-background-hub-gui-while-a-gam
title: Controller input leaks to the background hub GUI while a game is foreground
origin: parked
status: To Do
priority: high
labels:
  - korri
  - inputd
  - input-routing
  - hub
  - sm8550
created: 2026-07-03
source: user
---

# Controller input leaks to the background hub GUI while a game is foreground

## Why it matters

Observed live on Bandai: while playing a foreground game (RetroArch), controller input simultaneously navigates the Korri hub GUI in the background. inputd broadcasts gamepad input to its UI/socket subscribers (the Chromium hub) even when a game/gamescope surface owns the foreground, so the hub reacts to input it should not receive. This risks spurious navigation/launches behind the game and muddies input ownership. inputd (or the session policy) should suppress forwarding to hub/UI subscribers while a foreground game session is active, so gameplay input is exclusive to the game. Distinct from the overlay intercept work (that gates the game for the overlay; this is the inverse — the hub should not see game input).

## Acceptance Criteria

- [ ] While a foreground game/stream is active, controller input does not drive the hub GUI
- [ ] The hub only receives input when it is the foreground surface (home)
- [ ] No spurious hub navigation/launches occur during gameplay
- [ ] Verified on Bandai with RetroArch and a stream

## Related

- `product/services/device/inputd.ts`
- `product/services/device/sessiond.ts`
