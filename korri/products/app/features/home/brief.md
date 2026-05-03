---
id: home
title: Shift Home Surface
status: planned
jobs:
  - safe-game-resume
---

# Shift Home Surface Brief

---

**Source job**: `docs/jobs/safe-game-resume.md`
**Theme**: `korri/shared/themes/shift/`
**BDD spec**: `korri/products/app/features/home/e2e/home.feature`

---

## MVP scope (personal device only)

For the personal MVP (`docs/brainstorms/2026-05-02-personal-mvp-scope-requirements.md`):

- The rail is sourced from the `app.library.list` RPC and ordered by
  `lastPlayed` desc — the leftmost tile is the resume target.
- The home does not own launch behavior. It composes the resume
  shared `useLibraryLaunchController` controller (`korri/shared/library/use-library-launch-controller.ts`)
  and the `ShiftLaunchFailureBanner` molecule, but the launch contract
  itself is owned by the resume brief (SGR-R6 / SGR-R7).
- HOME-R1, HOME-R2, HOME-R3 are unchanged in shape — the rail and
  initial-focus invariants now resolve against real data instead of
  the in-repo fixture.

---

## Purpose

Translate the home-surface portion of the Safe Game Resume JTBD into product-level behavior the page can be planned, implemented, and tested against without re-deciding the visual language for every feature.

The home page is the player's entry point. It promises:

- The resume target is unmistakably the resume target.
- The player's focus is visible without their having to find it.
- The launcher never starts anything on its own.
- The available actions are discoverable.

This brief overlaps with the Safe Game Resume brief (`korri/products/app/features/resume/brief.md`) on the resume-target portion. Where they overlap, this brief points back to SGR; where the home adds promises beyond resume (caption tracking, HUD discoverability), the home owns those.

---

## Traceability IDs

| ID | Outcome | Source |
|----|---------|--------|
| HOME-O1 | Resume target is unmistakably the resume target on entry | derived from SGR-O2 (no re-decision) |
| HOME-O2 | The player can see which tile is focused without searching | home-specific |
| HOME-O3 | The home does not auto-launch | derived from SGR-O4 (explicit launch control) |
| HOME-O4 | Available actions on the home surface are discoverable | home-specific |

---

## In Scope

- Rendering the resume target as the visible, primary tile in the home rail.
- Placing initial focus on the resume target so spatial navigation has an anchor on mount.
- Tracking the focused tile and reflecting it in a caption that shows the focused game's display name (and the relative last-played time when the resume tile is focused).
- Presenting the canonical bottom-right HUD affordances (`Options`, `Close`, `Continue`).
- Presenting the search pill and menu button as visible affordances even when their behavior is not yet wired.

## Out of Scope

- Executing a launch command, performing pre-launch sync, or running progress-safety checks. Those are Safe Game Resume promises (`SGR-R3`-`SGR-R6`) and are tracked there.
- Detecting the last-played device (`SGR-R5`).
- Wiring the search pill, menu button, or `X Close` chip to real targets.
- Library navigation, profile switching, settings, store, or social.
- Drawer overlays, modals, or any secondary surface.
- Choosing a different resume target than `items[0]`. A future iteration that resolves resume from persisted state plugs in via the `resumeTarget` prop on `ShiftHomeRoot`; the home brief does not pin the resolution.

---

## Product Promises

### HOME-R1: Resume target is visible at home entry

When the home page renders, the resume target's tile is visible inside the rail and the focused-tile caption shows the resume target's display name.

- Traces to: HOME-O1
- BDD: `@HOME-R1` scenario "Resume target is visible and focused at home entry without auto-launch"

### HOME-R2: Resume target receives initial focus

When the home page renders, the rail places spatial-navigation focus on the resume target's tile so the player can confirm without searching.

- Traces to: HOME-O1
- BDD: `@HOME-R2` scenario "Resume target is visible and focused at home entry without auto-launch"

### HOME-R3: Home does not auto-launch

The home must not navigate, dispatch a launch command, or otherwise auto-activate the resume target merely because the player opened the launcher. This is the home-surface restatement of SGR-R2.

- Traces to: HOME-O3, SGR-O4, SGR-R2
- BDD: `@HOME-R3` scenario "Resume target is visible and focused at home entry without auto-launch"

### HOME-R4: Caption tracks the focused tile

Moving focus to another tile updates the caption to show that tile's display name. The caption position snaps under the focused tile rather than animating into place; the snap, not a slide, is the read of "this caption belongs to this tile".

- Traces to: HOME-O2
- BDD: `@HOME-R4` scenario "Caption updates when focus moves to another tile"

### HOME-R5: HUD displays the expected affordances

The home renders `Options`, `Close`, and `Continue` as visible HUD labels so the player knows which inputs the home recognizes. The HUD is presentational; the actions themselves are handled elsewhere.

- Traces to: HOME-O4
- BDD: `@HOME-R5` scenario "HUD displays the expected affordances"

---

## Open Implementation Questions

These belong in planning or follow-up briefs, not in the home brief:

- How should resume target resolution work when the home is wired to persisted state? `ShiftHomeRoot` already accepts a `resumeTarget` prop; the resolution lives outside the home brief.
- When the search pill is wired, does it route through the input bus (semantic action), the router, or both?
- When the menu button is wired, what surface does it open? (Tracked separately as a future drawer feature.)
- Should the relative last-played label format (`12m ago`, `3h ago`, `1d ago`) move into a shared helper once a second consumer needs it?
