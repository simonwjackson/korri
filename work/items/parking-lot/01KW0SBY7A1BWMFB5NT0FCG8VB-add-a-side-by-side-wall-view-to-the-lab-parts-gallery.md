---
id: 01KW0SBY7A1BWMFB5NT0FCG8VB
slug: add-a-side-by-side-wall-view-to-the-lab-parts-gallery
title: "Add a side-by-side \"wall\" view to the lab parts gallery"
origin: parked
status: To Do
priority: medium
labels:
  - lab
  - gallery
  - design-tool
  - states
created: 2026-06-26
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  commit: 71fb5fe0
  repo: korri
  invoked_by: se-work derive-states arc
---

# Add a side-by-side "wall" view to the lab parts gallery

## Why it matters

The derive-from-state-machines work is done: surfaces expose .tags, stateVariants produces an exhaustive labeled variant per state, and gallery parts export arrays the parts-discovery system already fans out (see ShiftCinematicHomeStates, ShiftCatalogHomeStates, PicoDataStates). But the /parts view renders ONE entry at a time (a navigator), so you cannot actually SEE all states of a page at once — which was the original goal ("surface all states of a page"). The derivation side is maximized; the remaining gap is purely a VIEW: a grid/wall mode that lays the discovered entries out side by side. This is owned by whoever is actively working in tools/theme-workshop/lab (parts-discovery), hence a coordination item rather than a parallel change.

## Acceptance Criteria

- [ ] The lab parts view offers an all-at-once wall/grid mode in addition to the one-at-a-time navigator
- [ ] Every discovered part (including the derived per-state entries) appears as a labeled cell
- [ ] Heavy cells lazy-mount so the wall stays responsive
- [ ] Coordinated with the active parts-discovery/lab work to avoid clobbering

## Related

- `tools/theme-workshop/lab/parts-discovery.ts`
- `product/platform/state/state-variants.ts`
- `product/surfaces/web/shift/pages/ShiftCinematicHomeStates.page.part.tsx`
- `docs/solutions/best-practices/derive-component-states-from-state-machines-2026-06-25.md`

## Notes

Scope: add a wall/grid view mode to the lab parts gallery (toggle alongside the current one-at-a-time navigator) that mounts every discovered part in a labeled cell. The data is already there — parts export arrays of Story objects; the navigator just shows them sequentially. Lazy-mount heavy cells (the cinematic home uses framer-motion; Boxbuster is WebGL — you can't mount 60 live at once). Coordinate before touching tools/theme-workshop/lab; a concurrent session is active there (parts-discovery, lab/prototype shell-chrome exploration which may already be exploring this). Convention captured in docs/solutions/best-practices/derive-component-states-from-state-machines-2026-06-25.md.
