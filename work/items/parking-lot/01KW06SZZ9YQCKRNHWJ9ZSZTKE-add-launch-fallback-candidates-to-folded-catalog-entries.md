---
id: 01KW06SZZ9YQCKRNHWJ9ZSZTKE
slug: add-launch-fallback-candidates-to-folded-catalog-entries
title: Add launch fallback candidates to folded catalog entries
origin: parked
status: In Progress
priority: high
labels:
  - korri
  - federation
  - launch
  - folding
created: 2026-06-25
source: se-work
context:
  cwd: korri/.worktrees/feat/federated-release-folding
  branch: feat/federated-release-folding
  repo: korri
  issue_ref: 01KVVMYE5SFC4H8X5H0EBY7WG3
---

# Add launch fallback candidates to folded catalog entries

## Why it matters

The launch handler only receives the selected id and source, so it cannot fall back to another same-identity copy when the preferred remote is unreachable unless the folded catalog exposes alternatives or the launch API can resolve the current fold server-side.

## Acceptance Criteria

- [ ] Folded fabric entries expose enough launch-alternative data for app.library.launch to try another copy after remote prepare failure.
- [ ] Remote-preferred launch tests cover fallback to a second launchable copy before returning host-unavailable.
- [ ] The added data stays additive and does not make surfaces perform folding.

## Related

- `work/items/active/01KVVMYE5SFC4H8X5H0EBY7WG3-federated-single-file-folding/plan.md`
- `product/apps/portal/api/catalog/fold-catalog-entries.ts`
- `product/apps/portal/api/library/launch.rpc-handler.ts`
