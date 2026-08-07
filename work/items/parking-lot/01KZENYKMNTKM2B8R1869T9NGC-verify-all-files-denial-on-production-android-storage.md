---
id: 01KZENYKMNTKM2B8R1869T9NGC
slug: verify-all-files-denial-on-production-android-storage
title: Verify all-files denial on production Android storage
origin: parked
status: To Do
priority: high
labels:
  - android
  - discovery
  - device-verification
created: 2026-08-07
source: se-work
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: feat/user-selected-game-discovery
  commit: 4f3106b1
  repo: korri
---

# Verify all-files denial on production Android storage

## Why it matters

TrebleDroid accepts MANAGE_EXTERNAL_STORAGE UID mode ignore but its userdebug FUSE layer still exposes adb-created fixture files. The reversible gate can prove unavailable-location preservation and recovery, but a production-like Android build must prove that real all-files permission denial itself blocks selected folders.

## Acceptance Criteria

- [ ] Run the explicit-serial discovery gate or a focused equivalent on a production-like Android build where UID app-op ignore is enforced by storage.
- [ ] Verify selected registered folders emit a selected-location storage diagnostic while access is denied.
- [ ] Verify launchable records remain listed during denial and scanning recovers after restoring allow.
- [ ] Restore the original UID app-op, files, and foreground activity state.

## Related

- `services/korrid/android-game-discovery-check.sh`
- `work/items/active/019fd344-b57a-723d-a089-762d7ca0b7e5-user-selected-game-discovery/plan.md`
