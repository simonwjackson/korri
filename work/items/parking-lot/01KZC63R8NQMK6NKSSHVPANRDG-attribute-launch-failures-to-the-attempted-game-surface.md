---
id: 01KZC63R8NQMK6NKSSHVPANRDG
slug: attribute-launch-failures-to-the-attempted-game-surface
title: Attribute launch failures to the attempted game surface
origin: parked
status: To Do
priority: high
labels:
  - ux
  - launch
  - shift
  - retroarch
created: 2026-08-06
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: feat/unified-android-game-overlay
  repo: korri
---

# Attribute launch failures to the attempted game surface

## Why it matters

When Wario launch fails, Shift returns Home and renders the error beneath whichever unrelated Home hero is currently selected (for example Detroit: Become Human), making the failure appear to belong to the wrong game and obscuring whether an existing session can be resumed.

## Acceptance Criteria

- [ ] A failed launch retains the attempted game identity and title in the visible failure surface
- [ ] The Home hero selection cannot relabel another game's launch error
- [ ] If the exact existing local session is securely resumable, selecting the same game switches to it instead of showing ActiveSessionConflict
- [ ] If it is not resumable, the error explains the exact stale/conflicting session without attributing it to another title

## Related

- `surfaces/shift/src/ShiftSurface.tsx`
- `clients/portal/src/launchables`
- `work/items/active/01KYTRBJ7758KAZ56XHFE1C8BR-unified-android-game-overlay/work.md`
