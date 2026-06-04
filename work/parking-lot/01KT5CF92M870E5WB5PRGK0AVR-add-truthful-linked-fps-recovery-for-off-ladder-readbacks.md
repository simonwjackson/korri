---
id: 01KT5CF92M870E5WB5PRGK0AVR
slug: add-truthful-linked-fps-recovery-for-off-ladder-readbacks
title: Add truthful linked-FPS recovery for off-ladder readbacks
origin: parked
legacy: task-125
status: To Do
priority: medium
labels:
  - evier
  - stream-control
  - ux
  - readback-truth
created: 2026-06-03
source: se-work
---

# Add truthful linked-FPS recovery for off-ladder readbacks

## Why it matters

When both Moonlight and GameScope read back a valid FPS that is outside the linked-control ladder (for example 40 or 100), Evier currently treats the linked slider as unknown/disabled to avoid false precision. Operators need a truthful way to recover to a supported linked FPS without snapping the displayed slider to a value that is not the authoritative readback.

## Acceptance Criteria

- [ ] Evier does not display nearest-step slider values as if they were authoritative readback for off-ladder linked FPS.
- [ ] A linked-mode operator can intentionally choose a supported linked FPS when current linked readback is known but off-ladder.
- [ ] Tests cover a known off-ladder linked FPS value such as 40 or 100.

## Related

- `korri/shared/themes/evier/pages/evier-control-catalog.ts`
- `korri/shared/themes/evier/pages/EvierStreamControlPage.tsx`
- `korri/shared/stream-control/control-contract.ts`

## Notes

Review suggested clamping to the nearest linked FPS step, but that would violate Evier's readback-only truth rule. Design a recovery affordance that preserves truth while allowing correction.
