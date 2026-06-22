---
id: 01KVM8T3VFAFFJM5H3B8989JRF
slug: migrate-bandai-local-steam-state-roots-to-managed-steam-home
title: Migrate Bandai local Steam state roots to managed Steam home
origin: parked
status: To Do
priority: medium
labels:
  - steam
  - bandai
  - migration
created: 2026-06-21
source: user
---

# Migrate Bandai local Steam state roots to managed Steam home

## Why it matters

Bandai’s persisted local.korri.yaml still overrode Steam state as {storage:@korri:steam/steam}/Steam, causing the new default policy to validate the wrong compatibilitytools.d path and fail with SteamCompatToolMissing until manually patched on-device. Future deploys need either a migration or a loud config diagnostic.

## Acceptance Criteria

- [ ] Bandai/current local config no longer contains {storage:@korri:steam/steam}/Steam for the Steam plugin state root.
- [ ] A startup/materialization diagnostic identifies stale nested Steam roots before launch.
- [ ] Document or automate a safe local config migration path with backup.

## Related

- `/var/lib/korri/config/local.korri.yaml`
- `product/plugins/steam/src/plugin.ts`
- `product/plugins/steam/src/materializer.ts`

## Notes

Manual patch applied on Bandai with backup /var/lib/korri/debug-backups/local.korri.yaml.before-managed-steam-root.20260621005040.
