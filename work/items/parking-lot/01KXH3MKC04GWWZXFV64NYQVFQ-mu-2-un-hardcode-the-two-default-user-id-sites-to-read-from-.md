---
id: 01KXH3MKC04GWWZXFV64NYQVFQ
slug: mu-2-un-hardcode-the-two-default-user-id-sites-to-read-from-
title: "MU-2: Un-hardcode the two DEFAULT_USER_ID sites to read from CurrentPrincipal"
origin: parked
status: To Do
priority: high
labels:
  - multi-user
  - library
  - foundation
created: 2026-07-14
source: user
---

# MU-2: Un-hardcode the two DEFAULT_USER_ID sites to read from CurrentPrincipal

## Why it matters

DEFAULT_USER_ID is used in exactly two places and both silently collapse per-user data to "default". Once the identity seam (MU-1) exists, these are the concrete points that convert dead userId plumbing into live behavior. Play stats shown in the library and play-history writes should attribute to the resolved user.

## Acceptance Criteria

- [ ] library-repository.ts attachPlayStats reads userId from CurrentPrincipal instead of DEFAULT_USER_ID
- [ ] launch.rpc-handler.ts drops the payload.userId ?? DEFAULT_USER_ID fallback
- [ ] Behavior is identical while the principal is "default"
- [ ] Regression test proves userId threading from boundary to play-log store

## Related

- `product/platform/library/proseql/library-repository.ts`
- `product/apps/portal/api/library/launch.rpc-handler.ts`
- `product/platform/library/config/records/user.ts`

## Notes

Depends on MU-1. Keep "default" as a stable sentinel string; never null/empty.
