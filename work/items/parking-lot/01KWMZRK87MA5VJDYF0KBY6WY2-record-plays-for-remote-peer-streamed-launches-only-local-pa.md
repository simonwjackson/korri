---
id: 01KWMZRK87MA5VJDYF0KBY6WY2
slug: record-plays-for-remote-peer-streamed-launches-only-local-pa
title: Record plays for remote/peer-streamed launches (only local path seeds beginLaunch)
origin: parked
status: To Do
priority: medium
labels:[]
created: 2026-07-03
source: se-plan
---

# Record plays for remote/peer-streamed launches (only local path seeds beginLaunch)

## Why it matters

The launch handler seeds coordinator.beginLaunch only in the local handleLaunchLibrary path (launch.rpc-handler.ts ~line 159). handleRemoteSourceLaunch dispatches through the same launchLocalForegroundSession seam but never calls beginLaunch, so playing a game streamed from a peer host records no play. The whole recording loop silently skips federated launches.

## Acceptance Criteria

- [ ] handleRemoteSourceLaunch seeds beginLaunch with the launch's user, game, release, launchId, and start time
- [ ] A remote/peer-streamed session that ends records exactly one gated per-user play
- [ ] Idempotent with the terminal completion path (launchId dedupe)

## Related

- `product/apps/portal/api/library/launch.rpc-handler.ts`
- `product/apps/portal/api/library/play-recording-coordinator.ts`
