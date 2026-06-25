---
id: 01KVY11YF0AFH31NVF7Q672679
slug: retire-shift-rail-home-migrate-dual-screen-primary-labs-syst
title: "Retire Shift rail home: migrate dual-screen primary + Labs/System/Companion off it"
origin: parked
status: To Do
priority: medium
labels:
  - shift
  - cleanup
  - dual-screen
  - home
created: 2026-06-24
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  commit: 35636a5a
  repo: korri
  invoked_by: se-work shift cinematic home swap
---

# Retire Shift rail home: migrate dual-screen primary + Labs/System/Companion off it

## Why it matters

The single-screen Shift home route now renders the cinematic home, but the rail home (ShiftHomeRoot + ShiftHomeRail + top/bottom bars + caption + the useShiftHome context) cannot be deleted because it is still the shipped dual-screen primary surface's home (portal DualScreenRouteRoot -> ShiftPrimaryDualScreenSurface) and the shared context the Labs panel, System panel, and Companion screen all read. Until those are migrated, the rail stack is live and duplicate home implementations coexist, which is the maintenance debt the user wants gone. Retiring it removes a whole parallel home implementation and its interwoven stories.

## Acceptance Criteria

- [ ] The dual-screen primary surface no longer composes ShiftHomeRoot/ShiftHomeRail (it uses the cinematic home or a deliberate replacement)
- [ ] Labs panel, System panel, and Companion screen work without ShiftHome.context (re-homed onto a surviving seam)
- [ ] ShiftHomePage/ShiftHomeReadyBody and the rail organisms/template/context are deleted with no dangling imports
- [ ] just typecheck introduces no new errors and the portal dual-screen tests pass
- [ ] Only the cinematic home remains as Shift's home implementation

## Related

- `product/surfaces/web/shift/pages/ShiftPrimaryDualScreenSurface.tsx`
- `product/apps/portal/features/dual-screen/DualScreenRouteRoot.tsx`
- `product/surfaces/web/shift/templates/ShiftHomeRoot.tsx`
- `product/surfaces/web/shift/pages/ShiftHomePage.tsx`

## Notes

Scope. (1) Decide the dual-screen primary's home: either adopt ShiftCinematicHome for the primary screen (design question — the cinematic is a single-screen scene; confirm it fits the dual-screen primary), or give dual-screen its own minimal home. (2) Re-home the shared useShiftHome context consumers — Labs panel, System panel, Companion screen — onto a surviving context (the cinematic home does not provide ShiftHome.context today). (3) Only then delete the orphaned set: ShiftHomePage, ShiftHomeReadyBody (+test), ShiftHomeRail, ShiftHomeRoot, ShiftHome.context, ShiftHomeTopBar, ShiftHomeBottomBar, ShiftHomeHudCluster, ShiftHomeCaption, ShiftHomeFeatureTile, ShiftHomePosterTile, and the stories/e2e that reference them (ShiftHomePage.stories, ShiftHomePage.story.e2e, ShiftHomeRail.stories, ShiftHomeRoot.stories, ShiftHomeLaunchTransition.stories, ShiftHomeReadyBody.test). Gotcha: ShiftHomeReadyBody is imported by stories of still-live organisms, so a naive delete breaks typecheck. Verify with just typecheck + the portal dual-screen tests (DualScreenRouteRoot.test, ShiftPrimaryDualScreenSurface.test) before/after.
