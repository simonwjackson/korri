---
id: 01KXBR8115TVVB5489EF2E7GN3
slug: assign-store-claim-art-through-the-game-assets-system-on-imp
title: Assign Store claim art through the game-assets system on import
origin: parked
status: To Do
priority: medium
labels:
  - acquisition
  - store
  - game-assets
created: 2026-07-12
source: se-work
---

# Assign Store claim art through the game-assets system on import

## Why it matters

Store-acquired games import with the claim's real title but no cover art (the Library shows a monogram/blank tile). Persisted metadata.media is forbidden by the readable schema — writing it rejected the whole korri.yaml fragment on Bandai and emptied the library until repaired. The sanctioned art path is the game-assets assignment system (app.game-assets.assign / game-asset records); the acquire pipeline already carries claim thumbnailUrl in the request and should assign it as the tile asset after import.

## Acceptance Criteria

- [ ] Acquired games show the claim thumbnail as tile art in the Library
- [ ] Art flows through game-asset assignment records, never persisted metadata.media
- [ ] Existing/authored art is never clobbered
- [ ] Covered by a test against the game-assets assign path

## Related

- `product/apps/portal/api/acquisition/acquire-placement.ts`
- `product/apps/portal/api/game-assets/assign.rpc.ts`
- `product/platform/library/config/records/game-asset-assignment.ts`
