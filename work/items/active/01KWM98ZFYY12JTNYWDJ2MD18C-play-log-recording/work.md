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

## Next / open (see status note)

- **U2 storage half:** the play-log store needs a proseql collection. `KorriLibraryDb`
  (`library-db-core.ts`) is a fixed interface; runtime/derived data uses the *sidecar*
  collection machinery (`artifacts`/`game-assets` precedent), not the readable YAML graph.
  Plan called this "non-canonical, precedented" — true, but it means wiring into the
  sidecar system + readable-schema strict-exclusion, i.e. real infra, not a one-method add.
- **U3 + U5 + U6 (big-bang swap):** removing `userData.lastPlayed`/`playtime` must land
  together with every consumer (shift + pico surfaces, importer, fixtures) to keep the
  whole-repo typecheck green. Wide but mechanical.
- **U4 (live recording):** composition-boundary still unconfirmed — no process currently
  observed to hold BOTH the foreground-session terminal and the writable library store.
  Needs a short investigation before wiring.
