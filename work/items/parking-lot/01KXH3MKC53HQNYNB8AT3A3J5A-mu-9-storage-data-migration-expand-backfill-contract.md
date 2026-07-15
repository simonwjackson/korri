---
id: 01KXH3MKC53HQNYNB8AT3A3J5A
slug: mu-9-storage-data-migration-expand-backfill-contract
title: "MU-9: Storage data migration (expand -> backfill -> contract)"
origin: parked
status: To Do
priority: low
labels:
  - multi-user
  - storage
  - migration
  - deferred
created: 2026-07-14
source: user
---

# MU-9: Storage data migration (expand -> backfill -> contract)

## Why it matters

Legacy singletons (peers.json, chromium state, Steam home, XDG data) must eventually move under users/default/ with backfilled ownership. Deferred until a second real user is blocked, but captured so the migration order is designed, not improvised.

## Acceptance Criteria

- [ ] Legacy per-user records backfilled with userId "default"
- [ ] Dual-path read: new records under users/<id>/, old records read from legacy paths as "default"
- [ ] Move-and-symlink only when a second real user lands
- [ ] Runs as a Nix activation/runtime step, not build-time

## Related

- `product/platform/config/xdg-paths.ts`
- `product/plugins/steam/src/plugin.ts`
- `work/parking-lot/01KSRGFP074RDRTVJ584FHN90A-multi-user-support.md`

## Notes

Depends on MU-5. Nix owns the derivation; data move is a runtime concern.
