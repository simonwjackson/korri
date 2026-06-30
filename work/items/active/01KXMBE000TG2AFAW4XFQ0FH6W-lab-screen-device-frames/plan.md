---
title: "refactor: Restructure dev-lab around screen vs device frames"
type: refactor
status: active
date: 2026-06-29
verify_command: "bun test tools/theme-workshop/lab product/surfaces/web/shift && just typecheck"
---

# refactor: Restructure dev-lab around screen vs device frames

## Summary

Adopt one mental model for the dev-lab built on two primitives: a **screen** is
one logical window (the unit of atomic design — a page fills exactly one screen),
and a **device** is physical hardware that tiles 1..n screens. The lab gets two
*frames* over the **same real app**: a **Compose** frame (logical, single-window,
device-agnostic — today's Gallery + Workshop) and a **Device** frame (physical
embodiment with bezels, millimetre sizing, and multi-screen handoff — today's
Preview). Both render through one page renderer — the real product
component/route driven by real edges — so there is no second, lab-only rendering
path. Phase 1 (this plan's active scope) makes that true where it currently is
not: Compose renders the **real** Home page composition seeded through real
edges, and the static re-implementation (`ShiftHomeStaticBody`) is deleted. The
broader view reorganization (naming the screen primitive, formalizing the Device
frame's screen tiling, merging the Gallery/Workshop surfaces, and migrating
Launch) is sequenced as phased follow-up so Phase 1 stays bounded and high
leverage.

---

## Problem Frame

The lab already has two honest halves at the *data* layer — Data and Foreground
are driven through real edges (`catalogFactsSourceLayerAtom`,
`foregroundSessionStatusLayerAtom`), and the live route reads only those atoms.
But at the *render* layer the lab has two paths: **Preview** mounts the real
surface (`mountSurface` → the real route), while **Workshop/Gallery** render
`ShiftHomeStaticBody` — a static re-implementation of the Home page that
re-encodes the route's composition logic (most recently its foreground→launch
feedback). Every state machine added forces that logic to be written twice, and
the two implementations will drift. This is exactly the "tool-only parallel
mechanism" the workshop's first principle warns against, surfacing at the render
layer instead of the data layer. The fix is to render the one real composition
everywhere and let only the *frame* (logical screen vs physical device) differ.
Doing it before the Launch machine is migrated means Launch is implemented once,
in the real route, and flows into the lab for free.

---

## Requirements

- R1. The Compose surface renders the **real** product page composition (the
  same component the live route renders), not a static re-implementation.
- R2. A single page renderer is shared by the live route and the lab;
  `ShiftHomeStaticBody` and its re-encoded route logic are deleted.
- R3. The Compose render is seeded **only** through real edges (catalog,
  foreground, library, launcher). No tool-only rendering path remains.
- R4. Adding a new state machine to the page (e.g. Launch) requires **no** second
  display implementation in the lab — it appears in Compose by virtue of the
  shared renderer.
- R5. Rendering the real page in many isolated Compose objects does not corrupt
  the capture seam: capture-coordinate publication is separated from rendering so
  concurrent objects do not race the shared live-coordinate singleton.
- R6. The **screen vs device** two-frame model is written down as the durable
  mental model in the workshop docs.
- R7. Existing Preview/Device behavior and all current lab + shift tests stay
  green; whole-repo typecheck is clean for touched files.

---

## Scope Boundaries

- Not renaming the lab's view tabs/UI to "Compose"/"Device" in this plan — the
  semantic renderer unification lands first; the UI vocabulary follows.
- Not merging the Gallery and Workshop surfaces into one Compose surface yet.
- Not migrating the **Launch** machine to the real edge — Launch is *interaction*
  state (the outcome of pressing play), a separate decision; this plan only
  ensures Launch will be implemented once when it lands.
- Not changing pico/boxbuster surfaces — Shift is the proving surface; the seam
  stays generic so other surfaces can adopt it later.
- Not formalizing the Device frame's multi-screen tiling reuse (Thor
  primary↔companion) in this plan.

### Deferred to Follow-Up Work

- Make "screen" a first-class primitive distinct from "device"; render Compose
  as a single logical screen (device-agnostic — no bezel, no millimetre sizing):
  separate follow-up item.
- Formalize the Device frame as "the page renderer × physical screens + bezels +
  dual-screen handoff," reusing Compose's renderer per screen: separate item.
- Merge Gallery + Workshop into one Compose surface, and unify per-object dials
  with Inspect⇄Live axes into one state-driving control: separate item.
- Migrate **Launch** to a *produced* state (press-play-against-a-succeed/fail
  launcher) rather than an injected controller override: separate item, to be
  planned after this lands.

---

## Context & Research

### Relevant Code and Patterns

- `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx` — the **real** Home
  composition: reads `catalogSnapshotAtom` + `foregroundSessionGateStateAtom`,
  uses `useLibraryLaunchController`, renders `ShiftHomeStateView` /
  `NavigatingReadyBody`. Also publishes the capture coordinate
  (`setShiftLiveData` / `setShiftLiveLaunch` / `setShiftLiveForeground`).
- `product/surfaces/web/shift/ShiftHome.page.part.tsx` — `ShiftHomeStaticBody`,
  the static re-implementation to retire, plus the baked `ShiftHomeStates`
  gallery variants that consume it.
- `tools/theme-workshop/lab/adapters/shift-surface-part.tsx` —
  `renderShiftSurfacePart`, the Compose render path that currently mounts
  `ShiftHomeStaticBody` in a seeded `RegistryProvider`.
- `tools/theme-workshop/lab/seed/shift-seed.ts` — `makeSeedInitialValues`
  (catalog/library/launcher/foreground edges) and the sync
  `shiftCatalogLayerForBinding`; the seeding surface for Compose.
- `tools/theme-workshop/lab/canvas/LabSurfaceView.tsx` + `LabSurfaceMount.tsx` —
  the Preview/Device path that mounts the real surface via `adapter.mountSurface`
  (the fidelity target Compose is moving toward).
- `product/surfaces/web/shift/shift-live-coordinate.ts` — the capture-publish
  singleton that must be separated from render (R5).

### Institutional Learnings

- `tools/theme-workshop/AGENTS.md` — the "tool is the app unwrapped; swap the
  data at the edge, never the mechanism" first principle this plan completes at
  the render layer.
- Prior adjacent lab plans: `work/items/active/01KXMBDC30A84B64BBB6FC9C8C-lab-region-state-model`
  (region/axis state model) and
  `work/items/active/01KXM7Q3V8WPK2YB6CD9NRTF4G-lab-inspect-live-states`
  (Inspect/Live unification) — this plan builds on their state model, it does not
  revisit it.

### External References

- None — this is a repo-internal refactor following established local patterns.

---

## Key Technical Decisions

- **One page renderer, shared by route and lab.** The lab renders the real Home
  composition (the component the route renders), never a copy. This is the
  load-bearing decision; everything else serves it.
- **Render the real route body in a seeded registry for Compose, not a full
  `mountSurface` per object.** Compose objects are sub-device logical windows;
  mounting a full router per board object is heavier than needed. The real
  composition (atom reads → `ShiftHomeStateView`) rendered inside a seeded
  `RegistryProvider` gives full fidelity (real launch controller, foreground
  gate) without a router. Full `mountSurface` stays the Device frame's mechanism.
  The exact extract-vs-render-directly shape is deferred to implementation.
- **Separate render from capture-publish.** The capture coordinate
  (`shift-live-coordinate`) is a Device/Preview concern (one running surface).
  Compose renders many objects at once, so the shared renderer must not publish
  the global coordinate. Capture-publish stays on the route/Device path; the
  shared composition does not publish.
- **Seed all four edges synchronously for Compose.** Catalog + foreground are
  already real edges; library + launcher (in-memory, succeed) must be seeded so
  the real launch controller resolves without a backend. No new tool-only path.
- **Phase 1 is renderer unification + docs only.** View renaming/merging and the
  screen-primitive formalization are deferred so this change is a bounded,
  reversible semantic correction.

---

## Open Questions

### Resolved During Planning

- *Should Compose reuse `mountSurface` (full router) or render the route body in
  a seeded registry?* — Render the route body in a seeded registry for Compose;
  reserve `mountSurface` for the Device frame. (Exact mechanism: deferred below.)
- *Does Launch block this?* — No. Launch stays on its singleton; rendering the
  real composition now means Launch is implemented once (in the route) when it is
  later migrated.

### Deferred to Implementation

- Whether to extract a named `ShiftHomeView` component shared by the route and
  the lab, or render `ShiftHomeRoute`'s body directly with capture-publish gated
  — both satisfy R2/R5; the cleaner seam is chosen against the real code.
- Exact gating mechanism for capture-publish (owner-scoped vs render-only
  variant) — resolved by reading `shift-live-coordinate.ts` against the route.
- Whether the in-memory launcher/library seed needs any per-object isolation, or
  the shared seed suffices for a non-interactive Compose preview.

---

## Implementation Units

### U1. Separate the Home composition's render from its capture-publish

**Goal:** Make the real Home composition renderable in isolation (many times,
concurrently) without racing the global live-coordinate singleton, so it can back
both the live route and the lab.

**Requirements:** R2, R5

**Dependencies:** None

**Files:**
- Modify: `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx`
- Possibly create: `product/surfaces/web/shift/routes/ShiftHomeView.tsx` (or
  equivalent shared composition) — exact shape deferred per Open Questions
- Modify (if extracted): `product/surfaces/web/shift/ShiftHome.page.part.tsx`
  imports
- Test: `product/surfaces/web/shift/routes/ShiftHomeRoute.test.ts` (existing,
  must stay green), `product/surfaces/web/shift/shift-current-coordinate.test.ts`

**Approach:**
- Factor the route into "render the real composition (read atoms →
  `ShiftHomeStateView`)" and "publish the capture coordinate." The route keeps
  both; the shared/extracted composition only renders.
- Preserve the route's existing behavior exactly — the capture-publish still
  happens on the live route path.

**Execution note:** Characterize first — the route already has focus/launch/
foreground tests; keep them green as the proof the extraction preserved behavior.

**Patterns to follow:**
- `ShiftHomeStateView` / `NavigatingReadyBody` already separate composition from
  the route shell — extend that seam rather than inventing one.

**Test scenarios:**
- Happy path: the live route still renders every Data state and the foreground
  feedback (existing `ShiftHomeRoute` + `shift-launch-preview-route` tests pass
  unchanged).
- Integration: the live route still publishes the capture coordinate
  (`readShiftCurrentCoordinate` reflects resolved data/launch/foreground — existing
  `shift-current-coordinate` and `shift.test` capture tests pass).
- Edge case: the render-only composition, rendered without the route wrapper,
  does **not** write the live-coordinate singleton (a second render does not
  clobber a first object's published coordinate).

**Verification:**
- All existing shift route + coordinate tests pass; a new test proves the
  render-only path does not publish.

---

### U2. Compose renders the real Home composition through real edges

**Goal:** Replace `ShiftHomeStaticBody` in the Compose render path with the real
composition from U1, seeded through all four real edges.

**Requirements:** R1, R3, R4

**Dependencies:** U1

**Files:**
- Modify: `tools/theme-workshop/lab/adapters/shift-surface-part.tsx`
- Modify: `tools/theme-workshop/lab/seed/shift-seed.ts` (ensure a sync seed of
  catalog + foreground + library + launcher for an isolated Compose object)
- Test: `tools/theme-workshop/lab/adapters/shift-surface-part.test.tsx`

**Approach:**
- `renderShiftSurfacePart` mounts the real composition (U1) inside a
  `RegistryProvider` seeded with the chosen Data source + Foreground state plus
  in-memory library/launcher, keyed on the binding so changing a dial re-seeds.
- Keep the existing `axisStateIds` foreground dial wiring; it now drives the real
  composition instead of the static body.

**Patterns to follow:**
- The existing seeded-`RegistryProvider` shape in `renderShiftSurfacePart`; the
  full-edge seed shape in `makeSeedInitialValues`.

**Test scenarios:**
- Happy path: a placed Home renders the dev library at Ready (games present),
  cozy → "Aurora Drift", retro → "Pixel Quest" — now through the real
  composition (no `ShiftHomeStaticBody`).
- Edge case: Data state Empty → "No games found."; LoadError → "Could not load
  library."
- Integration: Data=Ready × Foreground=Running renders the busy-session blocked
  feedback ("Another game is running") via the **real** route composition, not a
  re-encoded copy.
- Edge case: two placed Home objects bound to different sources render
  independently (no shared-singleton bleed — proves R5 end to end).

**Verification:**
- `shift-surface-part.test.tsx` passes against the real composition; a grep
  confirms the Compose path no longer references `ShiftHomeStaticBody`.

---

### U3. Retire `ShiftHomeStaticBody`; baked gallery parts use the real composition

**Goal:** Delete the static re-implementation and point the baked
`ShiftHomeStates` gallery variants at the same real composition, so the gallery
and Compose render identically.

**Requirements:** R1, R2

**Dependencies:** U2

**Files:**
- Modify: `product/surfaces/web/shift/ShiftHome.page.part.tsx` (delete
  `ShiftHomeStaticBody`; `ShiftHomeStates[tag].render` uses the real composition
  seeded with that Data state)
- Modify: any test importing `ShiftHomeStaticBody`
  (`product/surfaces/web/shift/shift-catalog-state-samples.test.tsx` and others
  surfaced by grep)
- Test: `product/surfaces/web/shift/shift-catalog-state-samples.test.tsx`

**Approach:**
- The baked gallery variant for each Data tag renders the real composition seeded
  with that tag's catalog sample (and resting foreground). One renderer for
  gallery + Compose + (eventually) Device.
- Remove the foreground-prop re-encoding added to the static body — it lives in
  the real route now.

**Test scenarios:**
- Happy path: the gallery part for each Data state (Loading / Ready / Empty /
  LoadError / Defect) renders the real composition without crashing
  (`[data-shift-home-frame]` present; Ready shows games).
- Edge case: `grep ShiftHomeStaticBody` returns no matches across `product` and
  `tools`.

**Verification:**
- Full lab + shift suite green; `ShiftHomeStaticBody` fully removed.

---

### U4. Document the screen vs device two-frame model

**Goal:** Make the unified mental model durable, not conversation-bound.

**Requirements:** R6

**Dependencies:** None

**Files:**
- Modify: `tools/theme-workshop/AGENTS.md`
- Modify: `tools/theme-workshop/lab/AGENTS.md`

**Approach:**
- Add the two primitives (**screen** = one logical window / the unit of atomic
  design; **device** = physical hardware tiling 1..n screens), the two frames
  (**Compose** over a screen; **Device** over a device), the nesting (Device
  reuses Compose's page renderer per screen), and the **one-renderer rule** (no
  static re-implementation; the lab always renders the real page). Note that
  per-object dials and Inspect⇄Live are one state-driving capability over real
  edges, surfaced in both frames.

**Test scenarios:**
- Test expectation: none — documentation only.

**Verification:**
- The workshop `AGENTS.md` states the screen/device model and the one-renderer
  rule; the lab `AGENTS.md` points to it.

---

## System-Wide Impact

- **Interaction graph:** The shared composition uses the real launch controller
  (`useLibraryLaunchController`) and `useOptionalDualScreenSession`; in an
  isolated Compose object these must degrade to no-ops (no dual-screen session,
  in-memory launcher). Verify graceful degradation during U2.
- **Error propagation:** Compose surfaces the real error states (LoadError /
  Defect) through `ShiftCatalogState`, not lab-invented copies — the same paths
  production renders.
- **State lifecycle risks:** The capture-coordinate singleton
  (`shift-live-coordinate`) is global; concurrent Compose renders must not write
  it (U1/R5).
- **API surface parity:** The generic lab seams (`renderSurfacePart`,
  `surfacePartAxes`) stay surface-agnostic; only the shift adapter changes.
- **Unchanged invariants:** Preview/Device (`mountSurface`) behavior, the Data
  and Foreground real edges, and the Inspect⇄Live axis model are unchanged — this
  plan only replaces the Compose render path and deletes the static body.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| The real route body depends on router/dual-screen/launch-controller and breaks when rendered in isolation. | Seed all four edges; confirm `useOptionalDualScreenSession` and the launch controller no-op without a session/backend; this is the explicit verification gate of U2. |
| Concurrent Compose objects race the global capture-coordinate singleton. | U1 separates render from capture-publish before U2 renders many objects. |
| Per-object real render is heavier than a static node, affecting board responsiveness. | Acceptable for a dev tool; the render is fixture-seeded and offline. Revisit only if the board becomes sluggish with many objects. |
| Deleting `ShiftHomeStaticBody` breaks baked gallery parts or their tests. | U3 repoints the baked variants at the real composition and updates the importing tests in the same unit; full suite is the gate. |

---

## Phased Delivery

### Phase 1 (this plan — active)
- U1–U4: one real page renderer in Compose, static body deleted, model
  documented. Bounded, reversible, unblocks a single-implementation Launch.

### Phase 2 (separate items — see Deferred to Follow-Up Work)
- Make "screen" a first-class primitive; Compose renders a single logical
  device-agnostic screen.
- Formalize the Device frame as the page renderer × physical screens + bezels +
  dual-screen handoff.
- Merge Gallery + Workshop into one Compose surface; unify dials + axes into one
  state-driving control.
- Migrate Launch to a produced state (interaction-state question), now
  single-implementation thanks to Phase 1.

---

## Sources & References

- **Origin:** in-session design alignment (this session) — no upstream
  requirements doc; `source: direct-prompt`.
- Related code: `tools/theme-workshop/AGENTS.md`,
  `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx`,
  `product/surfaces/web/shift/ShiftHome.page.part.tsx`,
  `tools/theme-workshop/lab/adapters/shift-surface-part.tsx`
- Related work items:
  `work/items/active/01KXMBDC30A84B64BBB6FC9C8C-lab-region-state-model`,
  `work/items/active/01KXM7Q3V8WPK2YB6CD9NRTF4G-lab-inspect-live-states`,
  `work/items/active/01KW12018RD97N1C8WHNN4W985-lab-design-tool-conversion`
