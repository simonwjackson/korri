---
id: 01KVXCY3TYKEBKN32S3N87GKVW
slug: add-uninstall-and-cache-pruning-for-gmloader-payloads
title: Add uninstall and cache pruning for GMLoader payloads
origin: parked
status: To Do
priority: medium
labels:
  - gmloader
  - storage
  - follow-up
created: 2026-06-24
source: se-plan
context:
  cwd: .
  repo: simonwjackson/korri
  invoked_by: se-plan
---

# Add uninstall and cache pruning for GMLoader payloads

## Why it matters

On handheld devices with limited storage, content-addressed normalized APK payloads will accumulate over time. Without an uninstall/prune path, the nix-run-like flow can silently consume storage even when games are no longer used.

## Acceptance Criteria

- [ ] Users or agents can remove an installed/cached GMLoader payload by id or source hash.
- [ ] Removal preserves unrelated payloads and fails safely for unknown ids.
- [ ] Library entries disappear after removal and cache state remains consistent.
- [ ] A documented pruning policy exists for abandoned staging directories or stale cached payloads.

## Related

- `product/plugins/gmloader`
- `work/items/active/01KVVAD3QZ3H7YCKPBA2ANY4Y8-build-a-nixified-generic-gamemaker-apk-compatibility-layer/plan.md`
