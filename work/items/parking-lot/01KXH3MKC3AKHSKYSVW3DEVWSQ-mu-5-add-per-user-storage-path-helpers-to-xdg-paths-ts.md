---
id: 01KXH3MKC3AKHSKYSVW3DEVWSQ
slug: mu-5-add-per-user-storage-path-helpers-to-xdg-paths-ts
title: "MU-5: Add per-user storage path helpers to xdg-paths.ts"
origin: parked
status: To Do
priority: medium
labels:
  - multi-user
  - storage
  - config
created: 2026-07-14
source: user
---

# MU-5: Add per-user storage path helpers to xdg-paths.ts

## Why it matters

Beyond the play-log store (already per-user), all Korri state/data/config paths key on the process $HOME. Adding user-scoped path helpers now establishes the per-user scoping primitive (Steam/Nextcloud users/<id>/ pattern) without moving any files, deferring the real migration until a second user lands.

## Acceptance Criteria

- [ ] korriUserDataPath / korriUserConfigPath / korriUserStatePath(env, userId, …) added
- [ ] Helpers resolve to …/korri/users/<userId>/…
- [ ] No data migration and no existing singletons moved in this slice
- [ ] Unit tests cover path derivation

## Related

- `product/platform/config/xdg-paths.ts`
- `product/platform/library/play-log-store.ts`

## Notes

Open decision: do Korri users map to OS users (XDG partitions for free) or stay Korri-internal? Best practice: avoid per-OS $HOMEs; keep single running device.
