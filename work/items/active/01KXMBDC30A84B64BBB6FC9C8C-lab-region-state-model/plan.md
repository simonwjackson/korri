---
title: "refactor: Model dev-lab state as regions (single | nested | multi)"
type: refactor
status: active
date: 2026-06-26
verify_command: "bun test tools/theme-workshop/lab product/surfaces/web/shift product/surfaces/web/pico"
---

# refactor: Model dev-lab state as regions (single | nested | multi)

## Summary

Replace the dev-lab's flat axis model — a per-axis `Record<string, string>` active map with an `enabledWhen` predicate standing in for nesting — with an honest statechart shape: each screen is a small **forest of regions**, where a *region is just a top-level (parentless) axis*. Axes gain a `kind` (`single` XOR | `multi` 0..n), a structural `parent` link replacing `enabledWhen`, and a per-axis active value that becomes a discriminated union (`single → value` | `multi → Set`). The States panel stacks regions with dividers, reveals nested axes under their parent's enabling state, and renders `multi` axes as checkboxes. We migrate the real Shift and Pico adapters onto the new model, surface one genuinely-real new Shift region — the **Foreground Session Gate** (already wired into `entry.tsx`, given a defined Home effect by `launchActionStateFrom`) — and delete the old flat model entirely. Build-forward, no backwards compatibility, dead code removed along the way.

---

## Problem Frame

The lab's axis model was designed when Shift Home looked like one nested machine (Data, with Launch under `Data:Ready`). Round-2/round-3 design work (see `region-model.md`) established that a real screen is **not one path**: several XOR regions are live at once (parallel/AND), and overlays are multi-active (0..n). Today's model encodes only "a flat list of axes, each a single string value, with one `enabledWhen` predicate for nesting." That under-models reality on three axes: it can't express parallelism cleanly (it works by accident because siblings happen to be independent), it has no notion of a multi-active set, and it uses a runtime predicate where a structural parent link would let the panel and Matrix render nesting and avoid impossible cells. We are correcting the model now, while only two real machines exist, so the migration is small and we never pay a second migration tax.

---

## Requirements

- R1. An axis declares a `kind` of `single` (exactly one state, or live) or `multi` (a 0..n set of states, or live when empty).
- R2. Nesting is structural: an axis may declare a `parent` (`{ axisId, whenStates }`); it is meaningful only while the parent's value is in `whenStates`. The `enabledWhen` predicate is removed.
- R3. The per-axis active value is a discriminated union keyed by `kind` (`single → value: string` | `multi → on: ReadonlySet<string>`); the screen active state is a record of these by axis id.
- R4. "Region" requires no separate type: a region is a parentless axis. The panel draws a divider before each parentless axis and indents/reveals nested axes under their enabling parent state.
- R5. `multi` axes render as multi-select (checkbox) affordances — visibly not a single pick — and drive their surface seam as a set.
- R6. Live/Inspect derivation generalizes: a `single` axis is live when its value is the live sentinel; a `multi` axis is live when its set is empty; global mode is `inspect` iff any axis (across every region) is pinned, else `live`.
- R7. The Matrix fan-out honors `parent` (no impossible cross-product cells) and handles `multi` axes coherently (a `multi` axis is not a fan-out dimension).
- R8. The real Shift adapter exposes `data` (single), `launch` (single, nested under `data:Ready`), and a new **Foreground Session Gate** region (single, parallel), each wired to production-inert preview singletons; capture-back round-trips all three.
- R9. The Foreground Session Gate is previewable in the lab and has a defined, non-invented effect on Shift Home via the existing `launchActionStateFrom({ launch, foreground })` mapping; the live route reads `preview ?? live`, inert in production.
- R10. The real Pico adapter is migrated to the new schema (its single `data` axis).
- R11. The old flat model is deleted: no `LabAxisActiveMap` string-record type, no `enabledWhen`/`disabledHint`-predicate path, no compatibility shim. Dead code removed.
- R12. `multi` is a first-class, unit-tested capability of the model, controller, and panel even though its first *real product* consumer is deferred (see Scope Boundaries).
- R13. Axis state lists remain DERIVED from each machine's `.tags` — never hand-authored (preserved invariant).

---

## Scope Boundaries

- Not inventing Connection or Session product machines — they do not exist and are explicitly out of scope. The Foreground Session Gate is the one real new region (it already exists and is wired).
- Not formalizing Launch's runtime dependency on the Foreground gate as model-level nesting. Launch stays nested under `data:Ready`; the Foreground gate is a sibling parallel region. Their real-world cross-coupling is expressed only where it already lives — in the view, via `launchActionStateFrom`.
- Not touching the `boxbuster` adapter beyond what a shared type-signature change forces (it exposes no axes today).
- Whole-repo `just typecheck` and `biome` are pre-broken on this sandbox's trunk (~93 pre-existing errors unrelated to this work); this plan does not fix them. Gate on touched-files-clean + focused `bun test` (see Verification).

### Deferred to Follow-Up Work

- First **real product** `multi` region (e.g. stacked notices/toasts on Shift Home): no real multi-active machine exists yet; surfacing one is product-definition work. The `multi` capability ships built and tested here; the first real consumer is a separate item once a real notice/overlay machine exists.
- Surfacing additional parallel regions (a real Connection or Session machine) if/when those machines are built — each is then ~one preview seam + one adapter axis on the rails this plan lays down.

---

## Context & Research

### Relevant Code and Patterns

- `tools/theme-workshop/lab/model/lab-state-axis.ts` — the model being evolved: `LabStateAxis`, `LabAxisActiveMap`, `LAB_AXIS_LIVE`, `isAxisLive`, `axisEnabled`, `liveActiveMap`, `pinAxisActive`, `releaseAxisActive`, `restorePinsActive`, `pinFromTable`, `renderFromTable`, `axisOptionsFromTags`.
- `tools/theme-workshop/lab/useLabAxisController.ts` — owns the per-axis lifecycle (pin/live/toggle/pinCurrent, nested release, release-on-selection-change). The discriminated-active change ripples through here.
- `tools/theme-workshop/lab/panels/LabStatesPanel.tsx` + `panels/LabStatesAxisGroup.tsx` — the render target for regions/nesting/multi.
- `tools/theme-workshop/lab/canvas/LabAxisMatrix.tsx` — axis fan-out; must honor `parent` and skip `multi`.
- `tools/theme-workshop/lab/adapters/shift-axes.tsx` — real Shift axes (`data`, `launch` via `enabledWhen`), `shiftCaptureCoordinate`. Pattern to mirror for the new region.
- `tools/theme-workshop/lab/adapters/pico-axes.tsx` — real Pico `data` axis.
- `tools/theme-workshop/lab/surface-registry.ts` — `LabSurfaceAdapter` (`axesForScreen`, `captureCoordinate`) typed against the model; signatures change with R3.
- `product/surfaces/web/shift/shift-launch-preview.ts` (83 lines) and `shift-catalog-preview.ts` (47 lines) — the **exact preview-singleton seam pattern** to copy for the Foreground gate (module-global value + subscriber Set + `preview ?? live` read), proven inert in production.
- `product/surfaces/web/shift/shift-current-coordinate.ts` + `shift-live-coordinate.ts` — capture-back reader + the live read seam to extend with the foreground tag.
- `product/platform/stream/foreground-session-gate-state.ts` — the real machine: `ForegroundSessionGateState` (`Ready | Preparing | Running | Cooling | Recovering | Unknown | LoadError`), with `foregroundSessionGateStateFromSnapshot`.
- `product/platform/library/launch-action-state.ts` — `launchActionStateFrom({ launch, foreground })`: the existing, non-invented mapping that gives the Foreground gate its effect on Home.
- `product/surfaces/web/shift/entry.tsx` (~lines 20-47, 199-201) — Foreground session layer already mounted into the live Shift surface.
- `product/surfaces/web/shift/pages/ShiftCinematicHome.tsx` — the Ready body; consumes `launchState`, reacts in-scene (no modal). Where foreground-derived action state surfaces.

### Institutional Learnings

- Preview-singleton seam (cross-root store the live route reads as `preview ?? live`, inert in production) is the proven mechanism for design-tool injection without coupling product to the lab — established by the prior work item `01KXM7Q3V8WPK2YB6CD9NRTF4G` and the existing launch/catalog previews.
- Dependency direction is **lab → product** only; product never imports `tools/theme-workshop/lab/**`. This is what bounds blast radius — verified: no product file imports the lab model.
- Surfaces are leaves: pico must not import shift; product must not import the dev-lab runtime.
- Derive-don't-author: axis state lists come from machine `.tags`.

### External References

- None required. This is an internal model refactor over existing, well-understood patterns; no new technology layer.

---

## Key Technical Decisions

- **A region is a parentless axis — no `Region` type.** Orthogonality falls out of sibling parentless axes; the panel draws a divider before each. Avoids a redundant abstraction and keeps `axesForScreen` returning a flat list (adapters just annotate). (see `region-model.md`)
- **Structural `parent` replaces `enabledWhen`.** Only `launch` used `enabledWhen` today, so removal is cheap. The structural form (`{ axisId, whenStates }`) lets the panel indent/reveal and the Matrix avoid impossible cells — neither is possible with an opaque predicate. We delete `enabledWhen` rather than keep it as an escape hatch (build-forward; reintroduce only if a real predicate-shaped need appears).
- **Discriminated `LabAxisActive` (`single | multi`).** Replaces the `Record<string,string>` map. Makes "this is a set, not a pick" representable and total; single-axis logic stays exhaustive. Screen active = `Record<axisId, LabAxisActive>`.
- **Foreground Session Gate is the real new region.** It is the only genuinely-real, already-wired parallel machine with a defined Home effect (`launchActionStateFrom`). Surfacing it proves parallel regions end-to-end against real product state without inventing semantics.
- **`multi` built now, consumer deferred.** The corrected model requires `multi` to be honest; building it forward (model + lab + tests, exercised by synthetic/fixture axes in unit tests) avoids a second migration. Its first *real product* consumer is deferred until a real notice/overlay machine exists (Scope Boundaries).
- **No back-compat.** Old types/predicate paths are deleted in the same change; all call sites move forward together.

---

## Open Questions

### Resolved During Planning

- Which real region satisfies Scope 2? **Foreground Session Gate** — real, wired, and given effect by `launchActionStateFrom`. (User chose "build one real new Shift region now.")
- Do Connection/Session exist? **No** — out of scope, not invented.
- Is there a real `multi` consumer today? **No** — `multi` ships as a tested capability; first real consumer deferred.
- Keep `enabledWhen` as a fallback? **No** — deleted; structural `parent` is the only nesting mechanism (build-forward).

### Deferred to Implementation

- Exact field/helper names on the discriminated union and the rewritten helpers (`pinAxisActive`/`releaseAxisActive`/`restorePinsActive`/`liveActiveMap` successors) — settle against the compiler while editing `lab-state-axis.ts`.
- The precise Home visual treatment when the Foreground gate is pinned to a non-`Ready`/`Running` state (e.g. `Cooling`/`Recovering`) — derive from `launchActionStateFrom` + existing `launchStatusView`; final copy/affordance is an execution detail, not a model decision.
- Whether `captureCoordinate`'s coordinate type needs the array branch wired now or left as the `single` shape until a real `multi` adapter axis exists — decide while migrating the Shift adapter (U6); the model/controller (U1/U2) support it regardless.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
LabStateAxis (evolved)
  id, label, liveLabel, states[]          // states DERIVED from .tags (unchanged)
  kind: "single" | "multi"                // NEW
  parent?: { axisId, whenStates[] }       // NEW — replaces enabledWhen
  pin(stateId) / release(stateId?)        // release(id) used only by multi (turn one off)
  renderSample?(stateId)

LabAxisActive (NEW, discriminated)
  | { kind: "single"; value: string }     // tag | LAB_AXIS_LIVE
  | { kind: "multi";  on: ReadonlySet<string> }   // {} = live

LabScreenActive = Record<axisId, LabAxisActive>     // replaces LabAxisActiveMap

Shift Home regions (forest):
  data        single    —                         (region)
   └ launch   single    parent data ▸ [Ready]      (nested)
  foreground  single    —                         (region, NEW; effect via launchActionStateFrom)
  // (future) overlays  multi   —                  (deferred: no real machine yet)

Panel render:
  for each parentless axis → divider + group
    if single → Auto chip + state chips
    if multi  → Auto + checkbox chips
    nested children appear under their parent's enabling state
```

Unit dependency graph:

```text
U1 (model: kind/parent/discriminated active)
  ├─> U2 (controller)
  │     ├─> U3 (states panel)
  │     └─> U4 (matrix)
  ├─> U6 (shift adapter migrate + new region)   <── U5 (foreground preview seam, product)
  ├─> U7 (pico adapter migrate)
  └─> U8 (registry types + delete dead code + docs)   <── depends on U1..U7 landing
```

---

## Implementation Units

### U1. Evolve the axis schema and active model

**Goal:** Add `kind` and structural `parent` to `LabStateAxis`, replace `LabAxisActiveMap` with the discriminated `LabAxisActive` / `LabScreenActive`, and rewrite the pure helpers accordingly. Remove `enabledWhen`/`disabledHint`-predicate support.

**Requirements:** R1, R2, R3, R4, R6, R11, R13

**Dependencies:** None

**Files:**
- Modify: `tools/theme-workshop/lab/model/lab-state-axis.ts`
- Test: `tools/theme-workshop/lab/model/lab-state-axis.test.ts`

**Approach:**
- Add `kind: "single" | "multi"` and `parent?: { axisId: string; whenStates: readonly string[] }`. Delete `enabledWhen` and the predicate branch of `disabledHint`.
- Introduce `LabAxisActive` (discriminated) and `LabScreenActive = Record<string, LabAxisActive>`; delete `LabAxisActiveMap`.
- Rewrite helpers: `isAxisLive` (single: value===LIVE; multi: empty set), `axisEnabled` (reads `parent` against the screen active), `liveActiveMap`→ screen-active initializer, `pinAxisActive`/`releaseAxisActive` (single set/clear; multi add/remove via `release(stateId)`), `restorePinsActive`. Keep `pinFromTable`/`renderFromTable`/`axisOptionsFromTags` as-is.
- `release` signature becomes `(stateId?: string) => void` (multi uses the arg to turn one off).

**Patterns to follow:** existing helper structure and doc-comment style in `lab-state-axis.ts`; derive-from-tags invariant.

**Test scenarios:**
- Happy path: a `single` axis active map round-trips pin → value, release → LIVE; `isAxisLive` true on LIVE.
- Happy path: a `multi` axis adds two states (`on` has both), removing one leaves the other, removing all → live (empty set), `isAxisLive` true.
- Edge: `axisEnabled` true when parent value ∈ `whenStates`, false otherwise; a parentless axis is always enabled.
- Edge: `liveActiveMap` initializer yields live for both kinds (LIVE value / empty set).
- Edge: `restorePinsActive` re-applies a remembered single pin and a remembered multi set, and leaves a never-pinned axis live.
- Error/total: helper functions are exhaustive over `kind` (a `multi` value never flows through single-only paths) — assert via a `multi` axis exercised through pin/release/live.

**Verification:** model unit tests pass; no reference to `LabAxisActiveMap` or `enabledWhen` remains in `lab-state-axis.ts`; touched-file typecheck clean.

### U2. Rework the axis controller for regions, nesting, and multi

**Goal:** Update `useLabAxisController` to operate over `LabScreenActive`, handle `multi` pin/toggle, derive enabled-ness from structural `parent`, and preserve nested-release + release-on-selection-change across the new shape.

**Requirements:** R3, R5, R6, R7 (capture handoff), R11

**Dependencies:** U1

**Files:**
- Modify: `tools/theme-workshop/lab/useLabAxisController.ts`
- Test: `tools/theme-workshop/lab/useLabAxisController.test.ts`

**Approach:**
- Replace `LabAxisActiveMap` usage with `LabScreenActive`. Add a `multi` branch to pin (toggle a state in the set) and to `liveAxis` (clear the set). `pinCurrent` maps a captured coordinate (value or array) onto single/multi actives.
- Global `toggleMode`: live = every axis live (empty/LIVE); restore re-applies remembered single values and multi sets.
- `applyAxisMap` nested-release uses `parent`/`axisEnabled`: when a parent leaves `whenStates`, force-release the now-disabled nested axis (single → LIVE; multi → empty), as today but structural.
- Release-on-selection-change cleanup unchanged in spirit (recompute axes from deps, release all on unmount).

**Patterns to follow:** current controller structure (the documented ordering contract); keep the same return shape (`screenAxes`, `activeByAxis`→`activeByAxis: LabScreenActive`, `mode`, `pinAxis`, `liveAxis`, `pinCurrent`, `toggleMode`).

**Test scenarios:**
- Happy path: pin a single axis → mode `inspect`, that axis value set, others live.
- Happy path (multi): pin two overlay states → both in `on`, mode `inspect`; live the axis → set empties, mode returns to `live` if nothing else pinned.
- Edge (nested): pin `data:Ready` then `launch:Launching`; pin `data:Empty` → launch force-released to live (parent left `whenStates`).
- Edge (toggle): pin single + multi, toggle to Live (all released, remembered), toggle back to Inspect (both restored).
- Edge (capture): `pinCurrent` applies a captured single value and a captured multi set; an absent axis maps to live.
- Integration: selection change to a screen with a different/empty axis set releases all prior axes (no leaked pins).

**Verification:** controller unit tests pass including new multi + structural-parent cases; touched-file typecheck clean.

### U3. Render regions, nesting, and multi in the States panel

**Goal:** Stack parentless axes as regions (divider before each), reveal nested axes under their parent's enabling state, and render `multi` axes as checkbox (multi-select) groups.

**Requirements:** R4, R5

**Dependencies:** U1, U2

**Files:**
- Modify: `tools/theme-workshop/lab/panels/LabStatesPanel.tsx`
- Modify: `tools/theme-workshop/lab/panels/LabStatesAxisGroup.tsx`
- Test: `tools/theme-workshop/lab/panels/LabStatesPanel.test.tsx`

**Approach:**
- Group axes by parent: top-level (parentless) axes render with a divider before each; a nested axis renders inside/under its parent group, visible only while the parent's value ∈ `whenStates` (mirrors the round-3 `r3-panelB` mock).
- `LabStatesAxisGroup` branches on `kind`: `single` → Auto chip + radio-style state chips (today's behavior); `multi` → Auto + checkbox chips (aria-checked, multiple `on`), calling pin (toggle on) / release(stateId) (toggle off).
- Keep the `Auto` label and `Pin current` affordance. Preserve existing dot/chip styling and the keyboard-accessible button conversion already in place.

**Patterns to follow:** existing `LabStatesAxisGroup` chip markup and `pt-axis-*` classes; the round-3 panel mock in `region-model.md` context (regions stacked with dividers, nested reveal, checkbox overlays).

**Test scenarios:**
- Happy path: a screen with two parentless single axes renders two region groups with a divider between them.
- Happy path (nested): nested `launch` group is present when `data=Ready`, absent when `data=Empty`.
- Happy path (multi): a `multi` axis renders checkbox chips; clicking two leaves both checked; clicking a checked one unchecks it (calls release with that id).
- Edge: an all-live screen shows every group with Auto active and no pins.
- Edge: the `Pin current` control still renders and invokes the handler.

**Verification:** panel unit tests pass; biome clean on touched files; visual parity with the approved Variant-B/region mock.

### U4. Make the Matrix fan-out region- and multi-aware

**Goal:** Ensure the axis Matrix honors `parent` (no impossible cross-product cells) and treats `multi` axes coherently (not a fan-out dimension).

**Requirements:** R7

**Dependencies:** U1

**Files:**
- Modify: `tools/theme-workshop/lab/canvas/LabAxisMatrix.tsx`
- Test: `tools/theme-workshop/lab/canvas/LabMatrixView.test.tsx`

**Approach:**
- Update the dependent-axis detection to use structural `parent`/`axisEnabled` instead of `enabledWhen`. Disabled cross cells show the existing "Not applicable"/hint treatment derived from `parent`.
- Exclude `multi` axes from the row/column axis pickers (a set isn't a fan-out dimension); only `single` axes are selectable. If a screen has only `multi` axes, the Matrix falls back to its empty/`single`-less state gracefully.

**Patterns to follow:** existing `LabAxisMatrix` cell/`framed` logic and the duplicate-axis guard already present.

**Test scenarios:**
- Happy path: two single axes (parent + child) fan into a grid; cells where the child's parent isn't satisfied render the disabled hint, not a sample.
- Edge: a `multi` axis does not appear in the column/row pickers.
- Edge: selecting the parent as the column and child as the row greys impossible cells (no crash, no blank sample).

**Verification:** matrix view tests pass; touched-file typecheck clean.

### U5. Add the Foreground Session Gate preview seam (product)

**Goal:** Add a production-inert preview singleton + sample table for `ForegroundSessionGateState`, mirroring the launch/catalog preview seams, and a live read seam so the running route can publish its current foreground tag.

**Requirements:** R8, R9, R12 (parallel-region proof), R13

**Dependencies:** None (product-side; pairs with U6)

**Files:**
- Create: `product/surfaces/web/shift/shift-foreground-preview.ts`
- Create: `product/surfaces/web/shift/shift-foreground-preview.test.ts`
- Modify: `product/surfaces/web/shift/shift-live-coordinate.ts` (add foreground live get/set)
- Modify: `product/surfaces/web/shift/shift-current-coordinate.ts` (read foreground: preview ?? live ?? default)
- Modify: `product/surfaces/web/shift/shift-current-coordinate.test.ts`

**Approach:**
- Copy the `shift-launch-preview.ts` shape: module-global `ForegroundSessionGateState | null`, subscriber `Set`, `setShiftForegroundPreview`/`getShiftForegroundPreview`/`useShiftForegroundPreview`, plus a `foregroundStateSamples` table keyed by tag (representative sample per `ForegroundSessionGateState` tag), built via the existing sample/`pinFromTable` conventions.
- Extend `shift-live-coordinate.ts` with `setShiftLiveForeground`/`getShiftLiveForeground` (module global, inert in production).
- Extend `readShiftCurrentCoordinate` to include `foreground` (pin/preview wins → live store → seed default `Ready`).

**Patterns to follow:** `product/surfaces/web/shift/shift-launch-preview.ts`, `shift-catalog-preview.ts`, `shift-live-coordinate.ts`, `shift-current-coordinate.ts` — same seam, same inert-in-production guarantee.

**Test scenarios:**
- Happy path: `setShiftForegroundPreview(sample)` notifies subscribers; `getShiftForegroundPreview` returns it; `null` clears.
- Happy path: `foregroundStateSamples` has an entry for every `ForegroundSessionGateState` tag (derive the tag list, assert coverage).
- Edge: `readShiftCurrentCoordinate` returns the live-store foreground tag when nothing is pinned, the pin when pinned, and the seed default when neither.
- Integration: a published live foreground tag is captured by `readShiftCurrentCoordinate` (round-trip for capture-back).

**Verification:** new + updated shift unit tests pass; production code paths never read preview unless set (inert) — asserted by the default-path test.

### U6. Migrate the Shift adapter and surface the new region

**Goal:** Re-express `data` (single) and `launch` (single, nested via `parent`) in the new schema, add the `foreground` region (single, wired to U5's seam with a `launchActionStateFrom`-driven `renderSample`), and update `shiftCaptureCoordinate` for all three.

**Requirements:** R8, R9, R10 (parity), R11

**Dependencies:** U1, U5

**Files:**
- Modify: `tools/theme-workshop/lab/adapters/shift-axes.tsx`
- Modify: `tools/theme-workshop/lab/adapters/shift.ts` (if axis wiring/exports change)
- Test: `tools/theme-workshop/lab/adapters/shift.test.ts`
- Modify (read-seam wiring): `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx` (publish live foreground tag; read `preview ?? live` for the gate-derived view state)

**Approach:**
- `data`: `kind:"single"`, no parent (unchanged states/sample/pin).
- `launch`: `kind:"single"`, `parent: { axisId: "data", whenStates: ["Ready"] }`; remove `enabledWhen`/`disabledHint`.
- `foreground`: `kind:"single"`, states from `ForegroundSessionGateState` tags, `pin`/`release` via U5's `setShiftForegroundPreview`, `renderSample` rendering Home with the foreground-derived action state (compose `launchActionStateFrom({ launch, foreground })` and feed `ShiftCinematicHome`/`ShiftHomeStateView` so the pinned gate visibly changes the scene).
- `shiftCaptureCoordinate`: include `foreground`; `launch` maps to live unless `data===Ready` (nesting round-trip preserved).
- `ShiftHomeRoute`: publish the resolved foreground tag to the live store (effect), and read `preview ?? live` for the gate where it influences Home — same shape as the existing catalog/launch preview reads.

**Patterns to follow:** existing `shift-axes.tsx` axis objects and `shiftCaptureCoordinate`; the existing `ShiftHomeRoute` publish-resolved-tag effects for data/launch.

**Test scenarios:**
- Happy path: `shiftAxesForScreen("/")` returns `data`, `launch`, `foreground`; `launch.parent` targets `data:[Ready]`; `foreground` is parentless (a region).
- Happy path: `foreground` states equal `ForegroundSessionGateState` tags (derived, not hand-authored).
- Edge: `shiftCaptureCoordinate` round-trips — `launch` → live when `data≠Ready`; `foreground` always captured.
- Integration: pinning `foreground` drives the preview singleton (the route's `preview ?? live` read reflects it) — assert via the read seam, not a full mount.
- Covers R9: pinning `foreground:Cooling` (or `Recovering`) yields a Home action-state distinct from `Ready` via `launchActionStateFrom`.

**Verification:** shift adapter tests pass; the live Shift route still defaults to live (no preview) in production; touched-file typecheck clean.

### U7. Migrate the Pico adapter to the new schema

**Goal:** Re-express Pico's `data` axis under the new model (annotate `kind:"single"`), with no behavior change.

**Requirements:** R10, R11

**Dependencies:** U1

**Files:**
- Modify: `tools/theme-workshop/lab/adapters/pico-axes.tsx`
- Test: `tools/theme-workshop/lab/adapters/pico.test.ts`

**Approach:**
- Add `kind:"single"` to the Pico data axis; confirm it has no `parent` and no `enabledWhen` to remove. No state-list or sample changes.

**Patterns to follow:** `pico-axes.tsx` current axis object; mirror the Shift `data` annotation.

**Test scenarios:**
- Happy path: `picoAxesForScreen("/")` returns the `data` axis with `kind:"single"` and the same derived states as before.
- Edge: a non-home screen returns an empty axis list (unchanged).

**Verification:** pico adapter tests pass; touched-file typecheck clean.

### U8. Update registry types, delete dead code, refresh docs

**Goal:** Update `LabSurfaceAdapter` signatures to the new active/coordinate types, delete every remaining reference to the old flat model, and refresh the lab AGENTS doc to describe regions/kinds/parent.

**Requirements:** R11, R4

**Dependencies:** U1, U2, U3, U4, U6, U7

**Files:**
- Modify: `tools/theme-workshop/lab/surface-registry.ts` (`captureCoordinate`/`axesForScreen` types → new model)
- Modify: `tools/theme-workshop/lab/adapters/boxbuster.ts` (only if the type change forces a touch)
- Modify: `tools/theme-workshop/lab/AGENTS.md` (document the region/kind/parent model; replace the nested-`enabledWhen` description)
- Modify: any remaining importers surfaced by a repo-wide search for `LabAxisActiveMap` / `enabledWhen`

**Approach:**
- Grep the lab tree for `LabAxisActiveMap` and `enabledWhen`; convert or delete each. Confirm zero references remain (build-forward; no shim).
- Update `LabSurfaceAdapter.captureCoordinate` return type and any active-map-typed fields to the new types.
- Rewrite the relevant AGENTS.md section to describe: region = parentless axis, `kind` single|multi, structural `parent`, multi-as-checkbox, derivation unchanged.

**Patterns to follow:** existing AGENTS.md "State axes + Inspect ⇄ Live" section structure.

**Test scenarios:**
- Test expectation: none — type/doc/cleanup unit with no behavioral change. Covered transitively by U1–U7 suites compiling against the new types.

**Verification:** repo-wide search shows no `LabAxisActiveMap` or `enabledWhen` references remain; the full focused suite (theme-workshop/lab + shift + pico) passes; AGENTS.md reflects the new model.

---

## System-Wide Impact

- **Interaction graph:** The discriminated-active type change radiates from `lab-state-axis.ts` to `useLabAxisController`, `LabStatesPanel`/`LabStatesAxisGroup`, `LabAxisMatrix`, `surface-registry`, and both real adapters. All are inside `tools/theme-workshop/lab/**`. Product changes are confined to new/extended **preview seams** in `product/surfaces/web/shift/**` and the existing `ShiftHomeRoute` publish-read pattern.
- **Error propagation:** Unknown/absent sample ids stay no-ops (the `pinFromTable`/`renderFromTable` cast-free lookups are preserved), so a bad tag can't crash an axis.
- **State lifecycle risks:** Nested release on parent change and release-on-selection-change must keep working under the new shape (U2 scenarios cover both); a leaked pin across surfaces is the prior-art risk this preserves protection against.
- **API surface parity:** Both real adapters (Shift, Pico) migrate together; `boxbuster` exposes no axes so it only follows the type signature.
- **Integration coverage:** The Foreground gate's `preview ?? live` read on the live route (U6) is the cross-layer behavior unit mocks won't fully prove — covered by the read-seam round-trip test rather than a full mount.
- **Unchanged invariants:** Dependency direction stays lab → product (product never imports the lab). Preview singletons stay inert in production (no preview set → live path). Axis state lists stay derived from `.tags`. The global Inspect ⇄ Live concept and the per-axis `Auto` affordance are unchanged in meaning.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Discriminated-union change ripples through many call sites at once (no back-compat) | Land U1 first with model tests green; each downstream unit (U2–U4, U6–U8) compiles against it with its own focused suite; gate on touched-file typecheck + `bun test` per unit. |
| Foreground-gate Home wiring regresses live launch behavior | Reuse the exact `preview ?? live` seam proven by catalog/launch; add a route read-seam round-trip test; assert production default path never reads preview. |
| `multi` built without a real product consumer becomes hollow/untested | Constrain `multi` to model + lab + unit tests exercised by synthetic/fixture axes (U1–U3 scenarios); the first real consumer is an explicit deferred item, not silently dropped. |
| Whole-repo typecheck/biome pre-broken masks new errors | Gate on touched-files-clean + focused `bun test` (documented in Scope Boundaries / Verification), not whole-repo green. |
| `enabledWhen` removal misses a hidden caller | U8 repo-wide grep for `enabledWhen`/`LabAxisActiveMap` asserts zero references before done. |

---

## Documentation / Operational Notes

- `tools/theme-workshop/lab/AGENTS.md` updated in U8 to describe the region/kind/parent model and the multi-as-checkbox affordance.
- `work/items/active/01KXMBDC30A84B64BBB6FC9C8C-lab-region-state-model/region-model.md` is the durable design rationale (regions, nesting, multi) backing this plan.
- No runtime/rollout/monitoring impact: the lab is a dev-only tool and all product changes are production-inert preview seams.

---

## Sources & References

- Design rationale: `work/items/active/01KXMBDC30A84B64BBB6FC9C8C-lab-region-state-model/region-model.md`
- Prior initiative (preview-seam + Inspect/Live foundation): `work/items/active/01KXM7Q3V8WPK2YB6CD9NRTF4G-lab-inspect-live-states/plan.md`
- Real machine: `product/platform/stream/foreground-session-gate-state.ts`; effect mapping: `product/platform/library/launch-action-state.ts`
- Seam patterns: `product/surfaces/web/shift/shift-launch-preview.ts`, `shift-catalog-preview.ts`, `shift-current-coordinate.ts`, `shift-live-coordinate.ts`
- Model + lab: `tools/theme-workshop/lab/model/lab-state-axis.ts`, `useLabAxisController.ts`, `panels/LabStatesPanel.tsx`, `panels/LabStatesAxisGroup.tsx`, `canvas/LabAxisMatrix.tsx`, `adapters/shift-axes.tsx`, `adapters/pico-axes.tsx`, `surface-registry.ts`
