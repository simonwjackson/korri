---
id: 01KWMZRK89XFF35C9QBQSCXV3C
slug: surface-times-played-playstats-playcount-somewhere-in-the-ui
title: "Surface \"times played\" (playStats.playCount) somewhere in the UI"
origin: parked
status: To Do
priority: low
labels:[]
created: 2026-07-03
source: se-plan
---

# Surface "times played" (playStats.playCount) somewhere in the UI

## Why it matters

The model derives playCount and totalPlaytimeSeconds per game, but surfaces only read lastPlayed (recency/Continue) and totalPlaytimeSeconds (playtime label). playCount is computed and never displayed — we track "times played" but nobody can see it. Either surface it or consciously decide it is internal-only.

## Acceptance Criteria

- [ ] A surface shows times-played, or a deliberate decision records that playCount stays internal
- [ ] If surfaced, it reads playStats.playCount (no new stored field)

## Related

- `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx`
- `product/surfaces/web/pico/fixtures.ts`
- `product/platform/library/config/records/play-log.ts`
