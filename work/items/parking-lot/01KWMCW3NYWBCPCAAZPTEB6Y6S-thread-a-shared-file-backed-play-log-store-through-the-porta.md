---
id: 01KWMCW3NYWBCPCAAZPTEB6Y6S
slug: thread-a-shared-file-backed-play-log-store-through-the-porta
title: Thread a shared file-backed play-log store through the portal composition root
origin: parked
status: To Do
priority: high
labels:[]
created: 2026-07-03
source: se-work
---

# Thread a shared file-backed play-log store through the portal composition root

## Why it matters

The play-log store is injected optionally into both the library repository (read: derives playStats) and the local foreground launch owner (write: records plays), but the portal composition root does not yet construct one file-backed store instance and pass the same reference to both. Until it does, recorded plays and read-side playStats use no shared durable store in production, so recording has no observable effect.

## Acceptance Criteria

- [ ] Portal composition constructs one createFilePlayLogStore rooted in a durable state dir
- [ ] The same store instance is passed to createLibraryRepository (playLogStore) and createLocalForegroundLaunchOwner (playLogStore)
- [ ] A play recorded during a session is visible as playStats on the next library list

## Related

- `product/platform/library/play-log-store.ts`
- `product/platform/library/proseql/library-repository.ts`
- `product/apps/portal/api/library/local-foreground-launch-adapter.ts`
