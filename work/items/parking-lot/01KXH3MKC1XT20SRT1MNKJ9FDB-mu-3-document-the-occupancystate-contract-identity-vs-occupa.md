---
id: 01KXH3MKC1XT20SRT1MNKJ9FDB
slug: mu-3-document-the-occupancystate-contract-identity-vs-occupa
title: "MU-3: Document the OccupancyState contract (identity vs occupancy)"
origin: parked
status: To Do
priority: medium
labels:
  - multi-user
  - session
  - docs
created: 2026-07-14
source: user
---

# MU-3: Document the OccupancyState contract (identity vs occupancy)

## Why it matters

Sessiond is single-occupant by design and that is correct for a handheld/console. The fix for multi-user is attribution, not concurrency. Naming OccupancyState and its relationship to ForegroundSessionOwner as a documented invariant prevents the Plex/Home-Assistant failure mode of an unclear identity-vs-session model.

## Acceptance Criteria

- [ ] OccupancyState tagged union (NoActiveProfile | ProfileActive) defined matching _tag conventions
- [ ] Single-user phase implemented as always ProfileActive("default")
- [ ] Doc in docs/solutions/architecture-patterns/ states: at most one active profile per device; occupancy owns the foreground session
- [ ] Cross-references sessiond-operator-model task-008

## Related

- `product/platform/session/foreground-session-owner.ts`
- `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`
- `product/platform/library/sessiond-managed-launch-protocol.ts`
