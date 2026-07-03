---
title: Complete the play-recording loop (per-user, event-driven)
type: feat
status: active
date: 2026-07-03
---

# Complete the play-recording loop (per-user, event-driven)

Close the play-history loop end-to-end with the corrected model agreed after
the initial play-log feature shipped: history is **per-user** (keyed by
user+game, default user for now), the catalog (game/release) carries no
history, recording is triggered by a **"session ended" event** (no timer;
duration = end − start), and one shared store backs both reads and writes.

Consolidates three backlog items:
- `01KWMW4X8CXS78K3Q01CDC9B82` — per-user, event-driven model (anchor)
- `01KWMCW3NWVD7H8ZEGBHJRJ8T0` — sessiond-managed terminal hook (Gap 1)
- `01KWMCW3NYWBCPCAAZPTEB6Y6S` — shared store through composition root (Gap 2)

Builds on the shipped foundation (`work/items/active/01KWM98ZFYY12JTNYWDJ2MD18C-play-log-recording/`),
which keys history by game only and observes the direct-launch terminal.

## Progress

- Planned (see `plan.md`).
