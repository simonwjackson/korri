---
id: 01KWN73D3PFQ28CMTYS7S3SPV3
slug: scope-the-decision-overlay-to-an-active-game-stream-not-the-
title: Scope the decision overlay to an active game/stream (not the hub)
origin: parked
status: To Do
priority: high
labels:
  - korri
  - overlay
  - inputd
  - sessiond
  - scope
created: 2026-07-04
source: user
---

# Scope the decision overlay to an active game/stream (not the hub)

## Why it matters

The chord currently triggers the overlay even on the hub/home GUI where nothing is running, so the menu pops with nothing to act on. The chord's purpose is to quit the current game, so the overlay (ring + menu) should only engage when a game or stream is the foreground session; on the hub it should do nothing. inputd has no foreground-session signal today. Needs a lightweight 'is a game/stream foreground' check (sessiond mode / a state file / foreground gamescope) wired into the overlay trigger, which also feeds sessionKind (local vs stream vs none).

## Acceptance Criteria

- [ ] Pressing the chord on the hub does nothing (no ring, no menu)
- [ ] The overlay engages only when a game or stream is the foreground session
- [ ] sessionKind resolves local vs stream from the same signal (replacing the 'local' stub)

## Related

- `product/services/device/overlay-wiring.ts`
- `product/services/device/inputd.ts`
- `product/services/device/sessiond.ts`
