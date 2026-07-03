---
id: 01KWMW4X8CXS78K3Q01CDC9B82
slug: model-play-history-as-per-user-event-driven-plays-not-on-gam
title: Model play history as per-user, event-driven plays (not on game/release, no timer)
origin: parked
status: To Do
priority: high
labels:[]
created: 2026-07-03
source: user
---

# Model play history as per-user, event-driven plays (not on game/release, no timer)

## Why it matters

The shipped play-log keys history by game id only and records via a start/exit observer. Two agreed design corrections must land before the recording loop is wired end-to-end: (1) play history is personal — it belongs to a (user, game) pair, not to the game or release, so the catalog stays a clean shared object and multi-user works for free later even with a single default user today; (2) recording must be a reaction to a 'game ended' event, never a running timer — duration is just (end timestamp − start timestamp), computed once when the end event fires. Getting the model right now avoids prying history back out of the game/catalog after real users exist.

## Acceptance Criteria

- [ ] Play history is keyed by (user, game), not by game or release alone; a default user is used for now
- [ ] A game record and a release record carry no play history; last-played/times-played/total are derived by looking up the current user's history for that game
- [ ] Each play entry references the game and may optionally tag the release it was launched from; history is owned by the user, not the release
- [ ] Recording is triggered by a 'game ended' event (hook/subscriber), with no service that ticks or counts during play; duration = end − start timestamps
- [ ] Prefer making the 'ended' event self-describing (carries start or elapsed) so the recorder is stateless; otherwise hold only a single start timestamp in memory

## Related

- `work/items/parking-lot/01KWMCW3NWVD7H8ZEGBHJRJ8T0-record-play-history-on-sessiond-managed-session-terminals-pr.md`
- `work/items/parking-lot/01KWMCW3NYWBCPCAAZPTEB6Y6S-thread-a-shared-file-backed-play-log-store-through-the-porta.md`
- `product/platform/library/play-log-store.ts`
- `product/platform/library/play-stats.ts`
- `product/apps/portal/api/library/play-recording-observer.ts`
