---
id: 01KWK3B7K7CV8YTWVATABANMSF
slug: rpcs3-settings-surface-phase-4-u10-deep-defaults-nested-subt
title: "RPCS3 settings surface Phase 4 (U10): deep defaults + nested subtrees"
origin: parked
status: To Do
priority: low
labels:[]
created: 2026-07-03
source: se-work
---

# RPCS3 settings surface Phase 4 (U10): deep defaults + nested subtrees

## Why it matters

Plan U10 (rpcs3-settings-surface) — the long tail: nested video.vulkan.* / video.performanceOverlay.*, Net, Savestate, VFS, extended Miscellaneous, and Log, with two-level YAML nesting in config-render. Value-free debug toggles stay escape-hatch-only. Deliberately deferred as the last, demand-driven phase behind overrides.config; curate individual keys as concrete needs surface rather than modeling ~200 keys up front.

## Related

- `work/items/active/20260702-rpcs3-settings-surface/plan.md`
- `product/plugins/rpcs3/src/config-render.ts`
- `product/plugins/rpcs3/src/mapping.ts`
