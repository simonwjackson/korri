---
id: 01KWK3B7K4YABNC10E0HY105J5
slug: rpcs3-settings-surface-phase-3-u9-per-game-cpu-gpu-accuracy-
title: "RPCS3 settings surface Phase 3 (U9): per-game CPU/GPU accuracy tuning"
origin: parked
status: To Do
priority: low
labels:[]
created: 2026-07-03
source: se-work
---

# RPCS3 settings surface Phase 3 (U9): per-game CPU/GPU accuracy tuning

## Why it matters

Plan U9 (rpcs3-settings-surface) — the per-game accuracy tranche (core.ppuDecoder/spuDecoder/spuBlockSize/spuXFloatAccuracy/clocksScale/librariesControl LLE list; video.write/readColorBuffers, strictRendering, msaa, disableZcull). Deliberately deferred as a later, demand-driven phase behind the overrides.config escape hatch. Introduces the first list-valued config entry, so config-render needs a YAML-sequence path. Build when a concrete game need appears; may spin out to its own per-game-tuning work item.

## Related

- `work/items/active/20260702-rpcs3-settings-surface/plan.md`
- `product/plugins/rpcs3/src/policy.ts`
- `product/plugins/rpcs3/src/mapping.ts`
