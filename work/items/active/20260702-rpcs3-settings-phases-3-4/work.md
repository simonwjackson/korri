---
title: RPCS3 settings surface — Phases 3 & 4 (per-game tuning + deep defaults)
type: feat
status: active
date: 2026-07-02
origin: work/items/active/20260702-rpcs3-settings-surface/plan.md
---

# RPCS3 settings surface — Phases 3 & 4

The remaining, **demand-driven** phases of the RPCS3 unified settings surface.
Phases 0–2 (plan units U0–U8) shipped on `feat/rpcs3-aka-source-plugin`; this
item owns the deferred long tail so the shipped increment is not blocked on it.

Both phases are backstopped by the `overrides.config` escape hatch, so they only
need to land when a concrete need appears — build a named setting when it earns
its place, not to model the whole `config.yml` up front.

## Scope

### U9 — Phase 3: per-game CPU/GPU accuracy tuning
- `core.ppuDecoder` / `core.spuDecoder` (recompiler/interpreter enums),
  `core.spuBlockSize` (safe/mega/giga), `core.spuXFloatAccuracy`,
  `core.preferredSpuThreads`, `core.clocksScale`, `core.librariesControl`
  (LLE **list** → the first list-valued config entry; `config-render.ts` needs a
  YAML-sequence path).
- GPU accuracy: `video.writeColorBuffers`, `video.writeDepthBuffer`,
  `video.readColorBuffers`, `video.strictRendering`, `video.msaa`,
  `video.disableZcull`.
- May spin out further into a dedicated per-game-tuning item with concrete game
  acceptance targets.

### U10 — Phase 4: deep defaults + nested subtrees
- Nested `video.vulkan.*` / `video.performanceOverlay.*` (two-level YAML),
  `net.*`, `savestate.*`, `vfs.*`, extended `misc.*`, `log.*`.
- Value-free debug toggles stay escape-hatch-only (see plan Scope Boundaries).

## References
- Design + unit detail: `work/items/active/20260702-rpcs3-settings-surface/plan.md` (U9, U10).
- Ground-truth strings: RPCS3 `system_config.h`, `system_config_types.cpp`.
- Backlog: `01KWK3B7K4YABNC10E0HY105J5` (U9), `01KWK3B7K7CV8YTWVATABANMSF` (U10).

## Verification (when built)
- `bun test product/plugins/rpcs3/src` green, including YAML round-trip tests for
  list-valued and nested entries.
