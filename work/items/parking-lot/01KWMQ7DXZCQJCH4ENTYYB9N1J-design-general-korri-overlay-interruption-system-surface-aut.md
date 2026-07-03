---
id: 01KWMQ7DXZCQJCH4ENTYYB9N1J
slug: design-general-korri-overlay-interruption-system-surface-aut
title: Design general Korri overlay/interruption system (surface-authored + generic floor)
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - overlay
  - ux
  - architecture
  - surfaces
  - compositor
created: 2026-07-03
source: user
---

# Design general Korri overlay/interruption system (surface-authored + generic floor)

## Why it matters

The stream/game lifecycle chord is the first consumer of what should be a general overlay/interruption system, and the choices made there should lead toward it rather than paint us into a corner. Many future features will want to draw an interruption/overlay over whatever is running. The system needs a resolution order: the active surface gets first refusal (a web surface whose author designed an on-brand pop-up for this interruption renders it itself), and a surface-independent generic floor is the fallback when the author designed nothing OR when the surface literally cannot draw its own UI (a game, a stream, a framebuffer surface, a CLI surface). The generic floor (a compositor-level layer-shell overlay) is the universal baseline precisely because those non-web surfaces can't self-render. Keeping the producer->overlay boundary abstract now (an 'overlay request', not a hardcoded ring; a resolver that today always routes to the floor) makes the surface-authored path additive later instead of a rewrite.

## Acceptance Criteria

- [ ] An abstract 'overlay request/intent' boundary exists between event producers (e.g. the chord hold supervisor) and renderers — renderers are not hardcoded into producers
- [ ] A resolver chooses the renderer: active web surface first refusal (surface-authored, on-brand) -> generic floor fallback
- [ ] Generic floor renders over any surface type (game, stream, framebuffer, CLI, web) via a compositor-level layer-shell overlay, independent of the heavy web hub
- [ ] A defined (even if minimal) contract lets a web surface author register/handle an interruption and decline to fall back to the floor
- [ ] Documented as the substrate for future overlay types, not just the kill chord

## Related

- `work/items/parking-lot/01KWMNX6R2N1BNCY124TWH94XF-stream-game-lifecycle-chord-decision-ux-never-auto-kill-remo.md`
- `product/services/device/inputd.ts`
- `product/platform/input/native/chord-hold-supervisor.ts`
- `product/apps/portal`

## Notes

Emerged during the kill-chord work (01KWMNX6R2). Keep-in-mind, do NOT build now beyond the abstract seam. Current effort only implements the generic-floor path via an existing layer-shell tool (nix run one-liner) with the chord ring as its first content. Framebuffer/CLI/game/stream surfaces always fall to the floor (they can't self-render) \u2014 which is the argument for the layer-shell floor as the universal baseline. Web surfaces are the enhancement case: author designs the on-brand pop-up, Korri shows it; sane fallback required when they don't.
