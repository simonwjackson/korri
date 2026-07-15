---
id: 01KXH3MKC4C67D9Y9JRAH3FZ3T
slug: mu-7-persist-favorites-hidden-to-userrecord-through-the-conf
title: "MU-7: Persist favorites/hidden to UserRecord through the config cascade"
origin: parked
status: To Do
priority: medium
labels:
  - multi-user
  - library
  - ui
created: 2026-07-14
source: user
---

# MU-7: Persist favorites/hidden to UserRecord through the config cascade

## Why it matters

UserRecord.favorites and .hidden are schema-ready but never read by the library projection, and the shift UI toggles favorites in ephemeral useState that is lost on reload. Making this state live turns existing schema work into real user-owned data.

## Acceptance Criteria

- [ ] ShiftLibraryDeck reads favorites/hidden from the resolved user's UserRecord, not useState
- [ ] A user.library.update RPC (or equivalent) writes favorites/hidden back through the config cascade
- [ ] Library projection reads favorites/hidden from the snapshot
- [ ] State survives reload

## Related

- `product/surfaces/web/shift/pages/ShiftLibraryDeck.tsx`
- `product/platform/library/config/records/user.ts`
- `product/platform/library/proseql/library-repository.ts`

## Notes

Depends on MU-1/MU-2 for resolving which user record to write.
