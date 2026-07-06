---
id: 01KWTQJS39SZGCWQRKH3Z8QE0W
slug: boundary-persistence-named-presets-and-per-game-memory-for-s
title: "Boundary persistence: named presets and per-game memory for stream controls"
origin: parked
status: To Do
priority: low
labels:
  - cli
  - streaming
  - persistence
  - presets
  - ux
  - task-067
created: 2026-07-06
source: user
---

# Boundary persistence: named presets and per-game memory for stream controls

## Why it matters

During the 2026-07-05 alignment, the CLI intentionally kept boundaries to per-launch + live only (the --save/persistence concept was dropped for the first build). Two lightweight persistence features were surfaced and deferred: (1) named presets -- save a flag-bundle by name and invoke it, which is exactly the manual 'cellular' cost-control preset the user wanted (they rejected AUTO per-network but liked an explicit preset); and (2) per-game memory -- remember boundaries per game. Per-game memory also unlocks cold-start's 'last-known-good' opening move (without it, cold-start uses the conservative + fast-ramp path only). Both are small and high-UX, but out of scope for the first controller, which focuses on the live optimizer. Same flat key=value schema; this is purely persistence layers plus a load path.

## Acceptance Criteria

- [ ] Named preset save/load (e.g. a 'cellular' preset) invocable on launch and live.
- [ ] Per-game boundary memory that persists the chosen box/lean per game.
- [ ] Wire per-game memory into cold-start's last-known-good opening move.
- [ ] Keep the identical key=value schema; define precedence in the cascade (defaults -> global/preset -> per-game -> per-launch -> live).
- [ ] Persistence is observable/round-trippable (dump a layer as key=value).

## Related

- `01KSXN94148T4616TA79KHQD9T`
- `01KWTMPE4MJXVR940R4X9GB0PR`
