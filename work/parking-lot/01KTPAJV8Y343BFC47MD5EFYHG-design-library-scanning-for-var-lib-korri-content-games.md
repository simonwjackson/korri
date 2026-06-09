---
id: 01KTPAJV8Y343BFC47MD5EFYHG
slug: design-library-scanning-for-var-lib-korri-content-games
title: "Design library scanning for `/var/lib/korri/content/games`"
origin: parked
legacy: backlog/task-084
status: To Do
priority: medium
labels:
  - "library"
  - "content"
  - "architecture"
  - "rootless-runtime"
created: 2026-06-09
source: user
---

# Design library scanning for `/var/lib/korri/content/games`

## Why it matters

The clean runtime model defines `/var/lib/korri/content/games` as the obvious manual game hierarchy, but automatic discovery/import behavior is unresolved. Capturing this prevents the rootless migration from accidentally baking in an ad-hoc scanner or forcing users into hidden paths.

## Acceptance Criteria

- [ ] A scanning/import policy is chosen: auto-scan, explicit import, hybrid curation, or config-only.
- [ ] The policy defines deterministic system/folder/extension mapping and conflict handling if scanning exists.
- [ ] The policy preserves `/var/lib/korri/content/games` as the human-facing manual content root owned by `korri:korri`.
- [ ] The policy does not depend on `/storage` or RockNIX-specific guest-visible paths; substrate storage details stay hidden below the Korri runtime contract.
- [ ] Tests cover candidate discovery/import behavior through public library contracts.

## Related

- `docs/plans/2026-06-09-001-refactor-rootless-korri-runtime-plan.md`
- `product/platform/library`
- `product/services/device`
- `product/systems/nixos/modules/korri-daemon.nix`
