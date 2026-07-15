---
id: 01KXH3MKC7FJ540H473R90EW75
slug: mu-11-profile-picker-and-user-management-ui
title: "MU-11: Profile-picker and user-management UI"
origin: parked
status: To Do
priority: low
labels:
  - multi-user
  - ui
  - deferred
created: 2026-07-14
source: user
---

# MU-11: Profile-picker and user-management UI

## Why it matters

Task-008 AC3 calls for portal UI for user selection/switching. Deferred until a second real human needs the device, but captured to complete the multi-user picture. Mirrors the Switch/Netflix first-class "who's playing?" launch prompt.

## Acceptance Criteria

- [ ] Portal UI to select the active profile
- [ ] Add/remove/name profiles
- [ ] Active profile updates CurrentPrincipal (layer atom swap)
- [ ] Live-USB VM smoke covers at least two users without state bleed

## Related

- `work/parking-lot/01KSRGFP074RDRTVJ584FHN90A-multi-user-support.md`

## Notes

Depends on MU-1. Trigger: a second real person is blocked from using the device.
