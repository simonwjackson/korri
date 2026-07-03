---
date: 2026-07-03
topic: play-log-recording
---

# Play Log: Recording What You Actually Played

## Summary

Playing a game inside Korri records the play. Each qualifying play appends an entry to a per-game **play log**, and "last played," "times played," and "total playtime" are all read from that log rather than stored as separate numbers.

---

## Problem Frame

Right now, "last played" is only real for games carried over from the previous system's import — it arrives as a single baked-in date with nothing behind it. When you launch a game *inside Korri today*, nothing writes back: the timestamp never moves, the recency ordering never updates, and "Continue" points wherever the import left it. For a library you actually play, the home screen's sense of "what's recent" is frozen the moment the import ran.

The cost compounds as more play happens in Korri and less through the old system: the surfaces meant to reflect recent activity drift further from the truth, and there is no record at all of how much or how often anything was played natively.

---

## The Model

Instead of storing "last played," "times played," and "total time" as three separate numbers that can drift apart, keep **one collection** — a log of play sessions — and treat every other value as a question you ask that log.

```
   You launch a game ─► a session runs ─► session ends
                                              │
                        duration ≥ threshold? │  (threshold = 0 today,
                                              │   so any real session)
                                       yes ───┤
                                              ▼
                        append one entry to that game's play log

   Play log for "Sonic"
   ┌──────────────────────────────────────────┐
   │  • Jun 20, 14:02   ·   35 min            │
   │  • Jun 22, 09:10   ·    3 min            │
   │  • Jul 01, 20:44   ·   90 min            │
   └──────────────────────────────────────────┘
             │
             ├──►  last played   =  Jul 01, 20:44   (newest entry)
             ├──►  times played  =  3               (entry count)
             └──►  total time    =  128 min         (entries summed)

   Home screen / detail read those derived values ─► re-sort, "Continue"
```

---

## Requirements

**Recording a play**

- R1. When a game session runs in Korri, the system observes how long that session lasted.
- R2. When a session ends and its duration meets or exceeds the current threshold, one entry — when the session occurred and how long it lasted — is appended to that game's play log.
- R3. The threshold is a single configured value, currently `0` (any real session qualifies), designed to be changed later without altering the recording logic.
- R4. Sessions below the threshold are never written to the log (gate at the door). No trace of a sub-threshold session is kept.
- R5. A play counts regardless of where the game actually runs — locally or streamed to another device. A session is a session.

**Deriving values from the log**

- R6. "Last played" is the time of the most recent entry in the log.
- R7. "Times played" is the number of entries in the log.
- R8. "Total playtime" is the sum of the durations of all entries.
- R9. A game with an empty or absent log reads as never played: no last-played, zero plays, zero total time.
- R10. The surfaces that already show these values — home recency sort, the "Continue" affordance, the playtime label, and the game-detail stats — read the derived values, so playing a game moves them on the next read.

**Replacing the old model**

- R11. The prior single-date representation of last-played (and any separate stored playtime tally) is removed; the play log is the sole representation. No dual-model support.
- R12. Any existing stored data, config, or seed files in the old shape are regenerated or migrated into the new shape as part of this change; no runtime backwards-compatibility path is retained.
- R13. The importer that brings games in from the old system produces data in the new shape.

---

## Acceptance Examples

- AE1. **Covers R2, R6, R7, R8.** Given a game with an empty log and threshold `0`, when a 35-minute session ends, then one entry is appended; last played = that session's time, times played = 1, total time = 35 min.
- AE2. **Covers R3, R4.** Given a future threshold of 2 minutes, when a 30-second session ends, then nothing is written and all derived values stay unchanged.
- AE3. **Covers R9.** Given a game never played in Korri and with no imported history, when a surface reads it, then it shows as never played (no last-played, zero plays, zero time).
- AE4. **Covers R5.** Given a session streamed to another device, when it ends and crosses the threshold, then it is logged exactly as a local session would be.
- AE5. **Covers R6, R10.** Given a game whose newest log entry is older than another game's, when the home screen sorts by recency, then playing the older game and adding a newer entry moves it ahead on the next read.

---

## Success Criteria

- After playing a game natively in Korri, the home screen's recency ordering and "Continue" reflect that play without any manual step.
- "Last played," "times played," and "total playtime" always agree with each other, because all three come from the same log — they cannot drift.
- A downstream planner can implement recording and derivation without having to decide *what* counts as a play, *what* is recorded, or *how* the old model coexists — those are settled here.
- No code path exists that still reads or writes the old single-date representation after this lands.

---

## Scope Boundaries

- No user-facing control to change the threshold. It stays `0`; only the mechanism is built to accept a different value later.
- No new home-screen or detail UI beyond feeding the existing recency sort, "Continue," and playtime displays.
- No ability to re-judge past short sessions if the threshold later rises — deliberately given up by choosing the gate over a lens.
- Nothing richer than time + duration per session — no save-state hooks, achievements, or per-session notes.
- Backwards compatibility with the old single-date model is explicitly not a goal.
- "Favorite" is untouched; it stays an independent attribute, not derived from the log.

---

## Key Decisions

- **Play log as single source of truth (derive, don't store):** last-played, times-played, and total-time are computed from one collection, so they can never disagree.
- **Gate at the door, not a lens:** sub-threshold sessions are never recorded. Simpler and smaller, at the accepted cost that today's threshold is baked into history and can't be reconsidered later.
- **Threshold defaults to `0`, config-driven:** ships the loop now (any real launch counts) while leaving room to tune later without touching recording logic. Boundary is inclusive — `duration ≥ threshold`.
- **No backwards compatibility (big bang):** alpha with no users, so the old model is replaced outright and any stale stored/seed/config data is regenerated into the new shape.
- **Entry timestamp is when the session occurred (its end time):** that is what recency ordering reads.

---

## Dependencies / Assumptions

- Relies on an existing session-completion signal in Korri (the system already knows when a launched session starts and ends). The recording loop hooks into that lifecycle rather than inventing session tracking. See `product/services/device/` (sessiond) as the likely anchor.
- The current representation being replaced lives in the library user-data model (`product/platform/library/config/records/game.ts`, `GameUserData`) and is read through the playable-library and the shift surfaces.
- "Favorite" remains a separate stored attribute and is out of the log's concern.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R13][Needs research] Whether the old-system importer seeds a single historical entry from the imported last-played date, or drops old play history entirely. Losing old history is acceptable at alpha; either is fine to decide during planning.
- [Affects R11][Technical] The concrete shape and storage location of the play log, and how it attaches to a game vs a specific release/version.
- [Affects R2][Technical] Exactly how a session's duration and occurrence time are captured from the existing session lifecycle.
