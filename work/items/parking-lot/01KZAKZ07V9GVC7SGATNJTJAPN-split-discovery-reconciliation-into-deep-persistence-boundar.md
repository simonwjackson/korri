---
id: 01KZAKZ07V9GVC7SGATNJTJAPN
slug: split-discovery-reconciliation-into-deep-persistence-boundar
title: Split discovery reconciliation into deep persistence boundaries
origin: parked
status: To Do
priority: medium
labels:
  - architecture
  - korrid
  - discovery
created: 2026-08-06
source: se-work
context:
  cwd: korri
  branch: feat/user-selected-game-discovery
  repo: korri
  invoked_by: final simplify review
---

# Split discovery reconciliation into deep persistence boundaries

## Why it matters

The MVP is verified, but `services/korrid/src/discovery/reconcile.rs` still combines pure planning, readable YAML pair commits, ownership/cache journals, recovery, and location lifecycle in a 1,500-line module. Separating those already-established seams will reduce the chance that later systems/providers break crash ordering or authored-data preservation.

## Acceptance Criteria

- [ ] A pure reconciliation planner is separated from readable config/library commit logic.
- [ ] Private discovery journal/cache persistence has one repository boundary with crash-order tests.
- [ ] Settings and discovery share one fixed-document atomic write policy instead of parallel implementations.
- [ ] Existing discovery/recovery tests remain green without behavior or schema changes.

## Related

- `services/korrid/src/discovery/reconcile.rs`
- `services/korrid/src/config/settings.rs`
- `work/items/active/019fd344-b57a-723d-a089-762d7ca0b7e5-user-selected-game-discovery/plan.md`
