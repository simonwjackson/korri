---
id: 01KWM7Q407Q0QDVZ4SY4BZBKHY
title: feat: Cross-launcher launch preferences (Phase 1)
status: active
created: 2026-07-03
source: parking-lot
---

# feat: Normalized cross-emulator settings vocabulary

Graduated from the parking lot (`item.md`). Plan derives an emulator-neutral
settings policy FROM the two shipped instances (RPCS3 `policy.ts`/`mapping.ts`
and Ryubing `policy.ts`), declared once at the inheritable cascade layer
(sibling of `MoonlightPolicy`) and translated per plugin into native config.

Scope is intentionally **phased**: Phase 1 lands the plumbing plus the small,
obviously-portable intersection (fullscreen, resolution, aspectRatio,
audio.volume). Non-portable knobs (audio backend/device) are deferred and the
vocabulary grows over time. See `plan.md`.
