---
id: 01KWMZRK89H2149748DMX530CH
slug: reconcile-read-write-user-asymmetry-in-play-stats-reads-hard
title: Reconcile read/write user asymmetry in play stats (reads hardcode DEFAULT_USER_ID)
origin: parked
status: To Do
priority: medium
labels:[]
created: 2026-07-03
source: se-plan
---

# Reconcile read/write user asymmetry in play stats (reads hardcode DEFAULT_USER_ID)

## Why it matters

Recording seeds userId as payload.userId ?? DEFAULT_USER_ID, so writes can be per-real-user. But the read projection (library-repository.ts attachPlayStats) loads playStats for a hardcoded DEFAULT_USER_ID. The moment any real userId flows at launch, plays record under that user but the home screen reads the default user's stats — recorded plays become invisible. Today it is consistent (single default user) but it is a latent split-brain that will surface with real multi-user.

## Acceptance Criteria

- [ ] The read projection resolves the same current user the recording path uses (single resolution point)
- [ ] Recording under a real userId is visible when reading as that user
- [ ] Default-user behavior is unchanged when no user is resolved

## Related

- `product/platform/library/proseql/library-repository.ts`
- `product/apps/portal/api/library/launch.rpc-handler.ts`
- `product/platform/library/config/records/user.ts`
