---
id: 01KWD9GFEJTKB1Y92NMGGTV9CG
slug: polish-shift-hero-title-crossfade-residue-on-fast-rail-navig
title: Polish Shift hero title crossfade residue on fast rail navigation
origin: parked
status: To Do
priority: low
labels:[]
created: 2026-06-30
source: se-debug
---

# Polish Shift hero title crossfade residue on fast rail navigation

## Why it matters

The hero now crossfades in place (no more stuck title or two-column snap-left), but the user still sees minor room for improvement in the outgoing/incoming title transition during fast navigation. Worth refining for a fully premium feel without reducing fidelity.

## Acceptance Criteria

- [ ] Outgoing/incoming hero titles crossfade with no perceptible ghosting or layout shift during rapid rail navigation on Bandai
- [ ] No fidelity/animation-duration reduction relative to current design
- [ ] Focused tests for ShiftCinematicHome still pass

## Related

- `product/surfaces/web/shift/ui/organisms/ShiftCineHero.tsx`
- `product/surfaces/web/shift/shift.css`

## Notes

Consider tuning AnimatePresence (e.g. mode=popLayout vs grid-stack), exit easing/duration, or opacity-only exit to remove residual ghost. Current fix grid-stacks hero layers into one cell.
