---
id: 01KXH3MKC4SAXR7A04X1Y7JTE3
slug: mu-6-propagate-userid-into-sessiond-session-lifecycle
title: "MU-6: Propagate userId into sessiond session lifecycle"
origin: parked
status: To Do
priority: medium
labels:
  - multi-user
  - session
  - sessiond
created: 2026-07-14
source: user
---

# MU-6: Propagate userId into sessiond session lifecycle

## Why it matters

Sessions are correlated by launchId only and carry no user identity. Task-008 explicitly calls for sessiond ownership becoming per-user. Attributing sessions to a user makes status/stop/freeze/thaw ownership-aware.

## Acceptance Criteria

- [ ] userId propagated into session start request and managed-launch protocol
- [ ] SessionStatusPayload surfaces the owning userId
- [ ] launchId remains the correlator; userId is additive
- [ ] Coverage proves userId flows from launch boundary through sessiond

## Related

- `product/apps/portal/api/session/status.rpc.ts`
- `product/platform/library/sessiond-managed-launch-protocol.ts`
- `product/apps/portal/api/library/play-recording-coordinator.ts`

## Notes

Depends on MU-1. Aligns with Task-008 in sessiond-operator-model doc.
