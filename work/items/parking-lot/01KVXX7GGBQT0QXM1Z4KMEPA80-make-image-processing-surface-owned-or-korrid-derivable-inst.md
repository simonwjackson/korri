---
id: 01KVXX7GGBQT0QXM1Z4KMEPA80
slug: make-image-processing-surface-owned-or-korrid-derivable-inst
title: Make image processing surface-owned (or korrid-derivable) instead of baked assets
origin: parked
status: To Do
priority: medium
labels:
  - media
  - korrid
  - surfaces
  - pico
  - architecture
created: 2026-06-24
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  repo: korri
  invoked_by: se-work lab multi-surface discussion
---

# Make image processing surface-owned (or korrid-derivable) instead of baked assets

## Why it matters

Surfaces currently can't restyle canonical catalog media: Pico's PICO-8 look only exists as pre-pixelized PNGs hand-mapped to specific fixture games, so any real catalog game (or new surface treatment) falls back to off-brand art. This blocks Pico (and future surfaces) from becoming real, atom-driven hosts on the seeded catalog, forces id-alignment hacks, and prevents per-device/per-surface art treatments. Resolving it removes the only hard blocker to multi-surface parity in the lab and unlocks consistent media styling across every host.

## Acceptance Criteria

- [ ] A surface can render any catalog game's media through a declared transform (e.g. pixelize:pico8) with no per-game baked asset and no hardcoded id mapping
- [ ] Pico's home + detail in the lab render the PICO-8 treatment derived from canonical catalog media for arbitrary seeded games
- [ ] Derived variants are cached/content-addressed (served by korrid or a shared transform layer) so hosts don't recompute per frame
- [ ] Shift continues to render with no/other treatment through the same seam
- [ ] The surface stays host-agnostic: it declares the treatment; it does not ship baked PNGs or know about devices

## Related

- `product/surfaces/web/pico/fixtures.ts`
- `product/surfaces/web/pico/PicoCart.tsx`
- `tools/theme-workshop/lab/seed/shift-seed.ts`
- `product/platform/library/game-assets/game-assets-service.ts`

## Notes

Two complementary layers. (1) Surface-owned: the catalog provides canonical source media (URL/asset id); the surface declares a transform (e.g. pixelize + PICO-8 palette remap) applied at render — note CSS image-rendering alone can't do palette remap, so this needs a canvas/WASM/shader step the surface owns. Shift applies none / its own (e.g. accent sampling from box art). (2) korrid-flexible: korrid's asset pipeline accepts processing directives (resize/format + pluggable named transforms like pixelize:pico8) and serves content-addressed, cached derived variants, so thin/Electrobun/low-power hosts don't pay per-frame cost. End state: a surface REQUESTS a derivation rather than shipping baked PNGs, which also eliminates the seed-id↔pixel-art alignment hack. Surfaces stay host-agnostic: they declare the desired treatment, korrid (or a shared client transform) produces it.
