---
id: 01KWMZWKFFY23AVV3BAEFDSPYS
slug: recover-play-recording-when-the-sessiond-exit-event-is-lost-
title: Recover play recording when the sessiond exit event is lost after readiness
origin: parked
status: To Do
priority: low
labels:[]
created: 2026-07-03
source: se-work
---

# Recover play recording when the sessiond exit event is lost after readiness

## Why it matters

Managed play recording relies on the owner observing session.exited (sessiond's child-exited event). The shared observer stops reconnecting once its result settles at readiness. On any sessiond role where readiness precedes game exit, a post-readiness SSE stream drop means observer.exited never resolves, the owner never reaches ExitObserved, and that play is silently not recorded. The primary kiosk role is unaffected (child-exited precedes home-ready), so this is a latent edge case, not a current-device regression — but it is the only real gap the original 'managed terminal' plan was reaching for, and its proposed fix (reusing session.exited) would not have closed it.

## Acceptance Criteria

- [ ] A managed launch whose sessiond event stream drops after readiness but before child-exited still records exactly one gated per-user play
- [ ] The recovery observer is independent of the owner's terminal and does not double-record (idempotent per launchId)
- [ ] Verified with a fake sessiond event stream that closes post-readiness then reports child-exited on reconnect

## Related

- `product/apps/portal/api/library/local-foreground-launch-adapter.ts`
- `product/platform/library/sessiond-managed-launch-event-observer.ts`
- `product/apps/portal/api/library/play-recording-coordinator.ts`
- `work/items/active/01KWMXG8YNPXR54EETWD6KS0K9-managed-terminal-recording/item.md`

## Notes

Effective fix is the origin item's approach: an independent, exit-only observeSessiondManagedLaunchEvents subscription keyed by launchId that keeps reconnecting until child-exited and calls coordinator.completeLaunch(launchId). Idempotency (per-launchId dedupe) makes it safe alongside the owner's ExitObserved completion.
