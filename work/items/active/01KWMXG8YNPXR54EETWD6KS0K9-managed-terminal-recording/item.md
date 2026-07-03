---
id: 01KWMXG8YNPXR54EETWD6KS0K9
slug: complete-play-recording-on-the-sessiond-managed-terminal-pri
title: Complete play recording on the sessiond-managed terminal (primary device path)
origin: parked
status: To Do
priority: high
labels:[]
created: 2026-07-03
source: se-work
---

# Complete play recording on the sessiond-managed terminal (primary device path)

## Why it matters

Everything for per-user play recording is now in place — the coordinator (beginLaunch/completeLaunch), per-user (user,game) store, shared read/write store, and direct-path completion via the owner's ExitObserved. The one remaining wire is the managed path: on sessiond-managed hosts the foreground owner hands terminal observation to sessiond after readiness, so the owner never fires ExitObserved and completeLaunch is never called. Without this, device plays still don't record despite the whole loop being built. This is the last step to close Gap 1 end-to-end.

## Acceptance Criteria

- [ ] On a managed launch, a detached subscription to the launch's sessiond terminal (observeSessiondManagedLaunchEvents exited-by-launchId, or the correlation lifecycle) calls coordinator.completeLaunch(launchId) when the game exits
- [ ] The completion is idempotent with the owner path (already guaranteed by completeLaunch's launchId dedupe)
- [ ] gameId/userId/releaseId come from the coordinator's pending context (seeded at launch), not from sessiond, which only knows launchId
- [ ] A managed session that ends records exactly one gated per-user play; verified with a fake sessiond terminal in a handler-level test

## Related

- `work/items/active/01KWMWAT06R3JG4FBR7VTDYNCV-play-recording-loop/plan.md`
- `product/apps/portal/api/library/launch.rpc-handler.ts`
- `product/apps/portal/api/library/play-recording-coordinator.ts`
- `product/platform/library/sessiond-managed-launch-event-observer.ts`
