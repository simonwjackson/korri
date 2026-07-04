---
id: 01KWNRFFV9S8CJN7G3EQHM5DAN
slug: move-shiftlibrarydeck-favorites-from-local-state-to-the-cata
title: Move ShiftLibraryDeck favorites from local state to the catalog/library data seam
origin: parked
status: To Do
priority: low
labels:
  - shift
  - state-seam
  - library
created: 2026-07-04
source: se-plan
---

# Move ShiftLibraryDeck favorites from local state to the catalog/library data seam

## Why it matters

ShiftLibraryDeck holds `favorites` in a local useState Set, but `favorite` is persistent userData, not view-state. Faking it locally means it is neither deterministic (lab can't reproduce it) nor real (doesn't persist or flow to other surfaces). It belongs at the catalog/library atom + an RPC mutation, the same seam catalogSnapshotAtom uses. Surfaced while planning the addressable-spaces work as the canonical "wrong seam" case; explicitly deferred from that plan because it's a data-seam relocation, not URL view-state graduation.

## Acceptance Criteria

- [ ] ShiftLibraryDeck reads favorite status from the catalog/library atom, not local useState
- [ ] Toggling favorite flows through an RPC mutation (optimistic per the react skill) rather than a local Set
- [ ] The favorite state is reproducible in the lab by seeding the data source

## Related

- `product/surfaces/web/shift/pages/ShiftLibraryDeck.tsx`
- `work/items/active/01KWP4Q8ZR6H3TXN0V9BMSD2FG-addressable-lab-spaces/plan.md`
