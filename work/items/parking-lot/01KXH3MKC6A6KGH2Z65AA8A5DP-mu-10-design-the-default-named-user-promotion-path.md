---
id: 01KXH3MKC6A6KGH2Z65AA8A5DP
slug: mu-10-design-the-default-named-user-promotion-path
title: "MU-10: Design the \"default\" -> named-user promotion path"
origin: parked
status: To Do
priority: low
labels:
  - multi-user
  - migration
  - deferred
created: 2026-07-14
source: user
---

# MU-10: Design the "default" -> named-user promotion path

## Why it matters

Plex and Home Assistant both got the multi-user model right but shipped dead-end migrations (can't upgrade an existing user without delete-and-recreate). A deliberate promotion path from the implicit "default" user to a named profile avoids that trap and protects existing state.

## Acceptance Criteria

- [ ] An existing default user can be promoted to a named profile without losing state
- [ ] No delete-and-recreate required
- [ ] Promotion path documented in docs/solutions/architecture-patterns/
- [ ] Play history, favorites, and config carry over

## Related

- `product/platform/library/config/records/user.ts`
- `work/parking-lot/01KSRGFP074RDRTVJ584FHN90A-multi-user-support.md`
