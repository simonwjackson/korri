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

- **U1+U2 DONE** — play history keyed by `(user, game)` + `DEFAULT_USER_ID`;
  `PlayEntry.releaseId` provenance; per-user read projection (default user);
  catalog stays history-free.
- **U3 DONE** — event-driven `play-recording-coordinator` (`beginLaunch`/
  `completeLaunch`, idempotent per launchId, no timer) replaces the observer;
  owner `ExitObserved` completes the direct path.
- **U4 DONE** — foreground session host builds the coordinator from the store
  and exposes it; launch handler seeds `beginLaunch` (user, game, release,
  start). Direct launches record per-user end-to-end.
- **U5 DONE** — `sharedPlayLogStore()` threaded into the host (write) and the
  live source-layer repositories (read): one source of truth.

## Remaining (backlogged)

- Managed-path terminal completion (sessiond hands off after readiness, so the
  owner never fires ExitObserved) — backlog `01KWMXG8YNPXR54EETWD6KS0K9`. This
  is the last wire before device plays record.

Verification: zero new whole-repo typecheck errors; all touched-area suites
green; biome clean on changed files.
