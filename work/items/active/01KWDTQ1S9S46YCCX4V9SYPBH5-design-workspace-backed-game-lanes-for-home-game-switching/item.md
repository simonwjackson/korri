---
id: 01KWDTQ1S9S46YCCX4V9SYPBH5
slug: design-workspace-backed-game-lanes-for-home-game-switching
title: Design workspace-backed game lanes for home/game switching
origin: parked
status: To Do
priority: high
labels:
  - sessiond
  - workspace
  - surface-lifecycle
  - input
created: 2026-07-01
source: user
---

# Design workspace-backed game lanes for home/game switching

## Why it matters

Korri needs Steam-Deck-like Home behavior where the hub remains alive and users can switch back to an active game. Future support for multiple simultaneous or frozen games needs a scalable lane/session model instead of one foreground launch being fire-and-forget.

## Acceptance Criteria

- [ ] Sessiond models the hub and each running game as addressable lanes with state (active, backgrounded, frozen, exited).
- [ ] Home button toggles hub <-> last active game without destroying either lane.
- [ ] Additional shortcuts or UI can enumerate/switch lanes when multiple games exist.
- [ ] The compositor mapping is generic (workspace/window roles), not surface-specific.
- [ ] Initial implementation can use Sway workspaces while leaving room for a future Gamescope-like compositor abstraction.

## Related

- `product/services/device/sessiond.ts`
- `product/services/device/sessiond-role.ts`
- `product/services/device/inputd.ts`
- `product/services/device/inputd-actions.ts`
- `product/services/device/sway-actions.ts`

## Notes

User explicitly wants arbitrary back-and-forth between Chromium hub and active game, with future multiple games/frozen games in mind.
