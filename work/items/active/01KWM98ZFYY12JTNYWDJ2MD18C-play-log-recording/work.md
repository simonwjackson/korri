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

## Next

- Execute (`/se-work`) starting at U1 (data model + threshold), or review the plan.
