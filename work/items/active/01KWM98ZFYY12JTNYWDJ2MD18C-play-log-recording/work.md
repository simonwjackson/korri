---
title: Play log — record what you actually played
type: feat
status: active
date: 2026-07-03
---

# Play log — record what you actually played

Close the loop so that playing a game inside Korri updates its own history.
Each qualifying session appends an entry to a per-game **play log**; "last
played," "times played," and "total playtime" are all *derived* from that log
rather than stored separately. A threshold gates what gets logged (`0` today,
built to be tuned later), applied as a gate at the door. The old single-date
last-played model is replaced outright — no backwards compatibility (alpha, no
users).

## Progress

- **Brainstorm DONE** — requirements captured in `requirements.md`.
  Key shape: play-log as single source of truth; derive last-played / count /
  total; gate-at-the-door threshold defaulting to 0; big-bang replacement of
  the old `GameUserData` single-date model.

- **Plan DONE** — see `plan.md` (6 units, Deep). Settled: play-log stored as a
  per-game document in the writable proseql store; derive `playStats` at
  `toPlayableLibraryEntry`; record at the foreground-session terminal via the
  composing daemon; importer seeds one entry from imported last-played.

- **U1 + U2 (derivation) DONE** — `feat/play-log-recording` worktree.
  - `product/platform/library/config/records/play-log.ts` (+ test): PlayEntry/PlayLog records.
  - `product/platform/library/play-stats.ts` (+ test): derivePlayStats + qualifiesForPlayLog gate (default 0).
  - Additive, non-breaking; 9 tests green.

- **U2 storage DONE** — `play-log-store.ts` (in-memory + file-backed, gate-at-door).
  Resolved simpler than the plan's sidecar route: a dedicated store injected into the
  repository, not a proseql canonical/sidecar collection.
- **U3 DONE** — derived `playStats` on `PlayableLibraryEntry`, projected in
  `listPlayableEntries` from the injected store; `GameUserData` lost `lastPlayed`/`playtime`.
- **U5 DONE** — rocknix importer seeds one entry from imported last-played; sorts by
  derived stats.
- **U6 DONE** — shift/pico surfaces, fixtures, dev-lab seed, and stories read `playStats`.
- **U4 PARTIAL** — `createPlayRecordingObserver` records a gated play on the owner's
  `Running -> ExitObserved` terminal; wired behind an optional store on the local
  foreground launch owner. Fires for owner-observed (direct) launches.

## Remaining follow-ups (backlogged)

- Sessiond-managed terminal recording (primary Korri path): the owner hands terminal
  observation to sessiond after readiness, so device plays need a sessiond-side hook.
  Backlog `01KWMCW3NWVD7H8ZEGBHJRJ8T0`.
- Thread one shared file-backed store through the portal composition root so read
  (`playStats`) and write (recording) use the same durable store. Backlog
  `01KWMCW3NYWBCPCAAZPTEB6Y6S`.

Verification: whole-repo typecheck introduces zero new errors (pre-existing baseline
noise only); biome clean on all changed files; all touched-area unit suites green.
