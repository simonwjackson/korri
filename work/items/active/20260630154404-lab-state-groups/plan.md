---
title: Refactor lab object states into independent groups
type: refactor
status: active
date: 2026-06-30
verify_command: "bun test tools/theme-workshop/lab && bun test product/surfaces/web/shift"
---

# Refactor lab object states into independent groups

## Summary

Refactor the theme-workshop lab's Compose-object state model so every selected part exposes a uniform list of independent state groups. The current primary `State` dropdown and adapter-supplied extra axes should converge into one model: zero groups for stateless parts, one group for simple state families, and many groups for pages like Shift Home that combine Data and Foreground.

---

## Problem Frame

The current Inspector treats one state collection as special: `LabObjectInstance.stateId` drives the hardcoded `State` dropdown, while `axisStateIds` holds every other group such as Foreground. That split is already leaking into render bindings, defaults, and tests, and it will not scale to pages composed from several independent real state machines.

---

## Requirements

- R1. A part or page can expose zero, one, or many independent state groups in the Compose-object Inspector.
- R2. The Inspector must not render a hardcoded primary `State` control; all state controls are rendered from the same state-group list.
- R3. The model must avoid flattening independent groups into cartesian-product variant names.
- R4. State controls must continue to drive the real app edge or the part's real public data contract; no component-level tool-only branches.
- R5. Existing Shift Home behavior must remain: Data selects the Home state family, Foreground combines independently, and Launch is still produced by pressing Play rather than injected as a lab control.
- R6. Existing Shift Game Detail behavior must remain: the promoted Split page exposes Play/Continue as its action-state family.
- R7. Device-view live axes remain separate from Compose-object state groups unless explicitly changed in a later plan.

---

## Scope Boundaries

- This plan targets the Compose object/part Inspector and page-part rendering path.
- Device-frame `LabStateAxis`, `useLabAxisController`, and live `pin`/`release` mechanics stay separate.
- AI/chat/copilot features are out of scope.
- Nested in-page selection of real children inside the running Device frame is out of scope.
- Pico's remaining preview singleton is not migrated here. If compilation requires a narrow compatibility shim, keep it minimal and leave Pico migration as follow-up work.
- No lab chrome, panel docking, or board layout redesign is included.

### Deferred to Follow-Up Work

- Migrate additional surfaces, including Pico, to real-edge state groups after Shift proves the pattern.
- Consider replacing Game Detail's fixture action states with a real play-history edge if the production app gains that state as data.
- Decide whether Device-view global fixture seeding should eventually use the same state-group container as Compose objects.

---

## Context & Research

### Relevant Code and Patterns

- `tools/theme-workshop/lab/panels/LabObjectInspector.tsx` currently renders a hardcoded `State` dropdown from `statesForStory` and then maps adapter-provided extra axes.
- `tools/theme-workshop/lab/model/lab-canvas-state.ts` currently privileges `stateId` and stores non-primary groups under `axisStateIds`.
- `tools/theme-workshop/lab/model/lab-part-model.ts` discovers variant families from `.part.tsx` exports and converts them into state options with `statesForStory` and `stateVariantFor`.
- `tools/theme-workshop/lab/surface-registry.ts` exposes `surfacePartAxes`, currently extra-axis-only for Compose page parts.
- `tools/theme-workshop/lab/adapters/shift.ts` supplies Shift Foreground as an extra page-part axis.
- `tools/theme-workshop/lab/adapters/shift-surface-part.tsx` renders Shift Home through real source-layer edges and currently consumes separate `stateId` plus `axisStateIds.foreground`.
- `product/surfaces/web/shift/ShiftHome.page.part.tsx` and `product/surfaces/web/shift/ShiftGameDetail.page.part.tsx` are the key page-part state-family examples.
- `tools/theme-workshop/AGENTS.md` and `tools/theme-workshop/lab/AGENTS.md` require swapping data at the real edge and avoiding tool-only render paths.

### Institutional Learnings

- `docs/solutions/best-practices/derive-component-states-from-state-machines-2026-06-25.md`: derive state lists from machine tags or state-variant declarations; do not hand-maintain lists that can drift.
- `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md`: convert runtime state at the seam and render domain state components, not raw async primitives or boolean forests.
- `docs/solutions/best-practices/control-driven-storybook-coverage-for-combinatorial-components-2026-05-01.md`: independent state dimensions belong in controls, not in cartesian-product story expansion.
- `docs/solutions/best-practices/product-owned-composition-keeps-shared-layers-reusable-2026-05-03.md`: the lab adapter is the composition root; product/shared components remain lab-unaware.

### External References

- External research skipped: this is an internal lab/model refactor with strong local patterns and no new third-party API surface.

---

## Key Technical Decisions

- Model Compose object state as named state groups, not as `stateId` plus `axisStateIds`: this directly satisfies the user's direction to stop treating the main State control as special.
- Keep Device live axes separate from Compose state groups: Device uses mutable registry pin/release behavior; Compose uses isolated render bindings and remounting. Merging them now would overreach and risk the already-working Inspect⇄Live path.
- Introduce a single helper that derives all Compose state groups for a story: the helper should combine the discovered variant-family group with adapter-owned extra groups so the Inspector and render path share one source of truth.
- Identify the variant-selecting group explicitly in the model: the renderer still needs to know which group chooses the concrete story variant. This is a render role, not a special UI control.
- Adapter-owned groups must self-filter by story: a surface adapter should return Foreground only for page/template/surface parts that can consume it, so atoms and molecules do not show irrelevant page-level controls.
- Preserve real-edge rendering: Shift Home group changes continue to feed `catalogFactsSourceLayerAtom` and `foregroundSessionStatusLayerAtom`; Game Detail action states continue to render through its page-part fixture data until production owns a richer edge.

---

## Open Questions

### Resolved During Planning

- Should the work be UI-only or should the model stop treating `stateId` as special? Resolved: model-level convergence is in scope for Compose objects.
- Should Device live axes be part of this migration? Resolved: not in this plan; they remain separate.
- Should independent state groups be flattened into one list? Resolved: no; each independent group remains its own control.

### Deferred to Implementation

- Exact state-group id derivation from part metadata: implementation should prefer stable, human-readable ids, but the final helper names and derivation details can be settled while updating tests.
- Exact naming of the replacement object-state field: implementation should choose the clearest name in local style, but it must no longer privilege one group as `stateId`.
- Whether `surfacePartAxes` is renamed or wrapped: a direct rename may be worthwhile, but the implementer can decide based on call-site churn.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
Selected story + story index + surface adapter
  └─ derive object state groups
       ├─ variant-family group from discovered part states
       │    └─ marks the group that selects the concrete Story variant
       └─ adapter-owned groups such as Foreground
            └─ returned only when the story can consume them

LabObjectInstance
  ├─ sourceId
  └─ state group values keyed by group id

Inspector
  └─ render every group in order with the same control component

Canvas render
  ├─ use variant-selecting group value to choose the Story variant
  └─ pass all group values to adapter renderers that seed real edges
```

---

## Implementation Units

### U1. Introduce the Compose object state-group read model

**Goal:** Add a pure state-group derivation layer for Compose objects so callers can ask, "which independent state groups does this selected story expose?"

**Requirements:** R1, R2, R3

**Dependencies:** None

**Files:**
- Create: `tools/theme-workshop/lab/model/lab-object-state-groups.ts`
- Create: `tools/theme-workshop/lab/model/lab-object-state-groups.test.ts`
- Modify: `tools/theme-workshop/lab/surface-registry.ts`
- Modify: `tools/theme-workshop/lab/adapters/shift.ts`

**Approach:**
- Define a Compose-only state-group shape distinct from Device `LabStateAxis`.
- Each group must have a stable id, label, options, default value, and an explicit render role when it selects the concrete `Story` variant.
- Wrap the discovered variant family from `statesForStory` as a state group when a story has part states.
- Mark the variant-family group as the one that selects the concrete `Story` variant for rendering; this is a render role, not a privileged Inspector control.
- Continue accepting adapter-owned groups such as Shift Foreground, but make adapters responsible for returning those groups only for stories that can consume them.
- Reject or guard against duplicate group ids so adapter-owned groups cannot collide with the discovered variant group.
- Add one pure normalization helper for missing or invalid stored values; object creation, Inspector display, and render adapters should all consume the same normalized values.

**Execution note:** Implement the pure derivation helper test-first before touching React components.

**Patterns to follow:**
- `tools/theme-workshop/lab/model/lab-part-model.ts`
- `tools/theme-workshop/lab/adapters/shift.ts`
- `tools/theme-workshop/lab/model/lab-state-axis.ts` only as naming inspiration; do not merge types.

**Test scenarios:**
- Happy path: a stateless atom story returns no state groups.
- Happy path: a page story with a state-variant family returns one variant-selecting group with all discovered states.
- Happy path: Shift Home returns Data plus Foreground groups in stable order.
- Happy path: Shift Game Detail returns its Action state group and does not receive the Home-only Foreground group.
- Edge case: a page story with no variant family but with adapter-owned groups returns only the applicable adapter groups.
- Edge case: adapter-owned groups are not returned for non-fill atom/molecule stories.
- Edge case: duplicate or case-varied state tags are still de-duplicated through the existing `statesForStory` behavior.
- Edge case: duplicate group ids are rejected or made impossible by the helper contract.
- Edge case: missing or invalid stored group values normalize to declared defaults in one shared helper.

**Verification:**
- The new pure model tests cover zero, one, and multiple state-group cases.
- Existing part discovery behavior is unchanged.

---

### U2. Migrate Compose object instances to store state group values uniformly

**Goal:** Replace the `stateId` plus `axisStateIds` split for Compose objects with one state-group value container used by creation, binding, movement, and rendering.

**Requirements:** R1, R2, R3, R5, R6

**Dependencies:** U1

**Files:**
- Modify: `tools/theme-workshop/lab/model/lab-canvas-state.ts`
- Create or modify: `tools/theme-workshop/lab/model/lab-canvas-state.test.ts`
- Modify: `tools/theme-workshop/lab/LabShell.tsx`
- Modify: `tools/theme-workshop/lab/canvas/LabWorkshopBoard.tsx`
- Modify: `tools/theme-workshop/lab/canvas/LabDraggablePart.tsx`
- Modify: `tools/theme-workshop/lab/canvas/LabComposeView.tsx`
- Modify: `tools/theme-workshop/lab/canvas/LabCanvasContent.tsx`

**Approach:**
- Update `LabObjectInstance` so Compose object state values are stored under group ids instead of one privileged primary field and a second extra map.
- Update object creation/reconciliation so each new instance receives defaults for all state groups exposed by its selected story.
- Preserve `sourceId`, position, selection, movement, and remove behavior.
- Keep Device-view `activeStateId` and `LabSurfaceView` unchanged; this plan only changes Compose object state storage.
- Ensure stateless parts still render without needing state values.

**Execution note:** Characterize current object creation and binding behavior before replacing the storage shape.

**Patterns to follow:**
- `tools/theme-workshop/lab/model/lab-canvas-state.ts`
- `tools/theme-workshop/lab/LabShell.tsx`
- `tools/theme-workshop/lab/canvas/LabDraggablePart.tsx`

**Test scenarios:**
- Happy path: selecting a single-state-family story creates an object with the variant group default populated.
- Happy path: selecting Shift Home creates an object with Data and Foreground defaults populated.
- Happy path: changing one group preserves other group values and object position.
- Happy path: object creation uses the shared normalization/default helper for every group.
- Edge case: selecting a stateless part creates an object with no state groups and still renders.
- Edge case: deselecting and reselecting a story reconciles instances without leaking stale group values from removed objects.
- Integration: `LabDraggablePart` still selects the correct story variant using the variant-selecting group value.

**Verification:**
- Generic canvas-state tests pass with the new storage shape.
- Existing Compose board tests, if present for object placement/movement, remain green or are updated to assert the new public model behavior.

---

### U3. Refactor the object Inspector to render state groups uniformly

**Goal:** Remove the hardcoded `State` row from `LabObjectInspector` and render every state group through the same path.

**Requirements:** R1, R2, R3

**Dependencies:** U1, U2

**Files:**
- Modify: `tools/theme-workshop/lab/panels/LabObjectInspector.tsx`
- Create: `tools/theme-workshop/lab/panels/LabObjectInspector.test.tsx`
- Modify: `tools/theme-workshop/lab/LabShell.tsx`

**Approach:**
- Feed `LabObjectInspector` the selected story and object state-group values.
- Render Data/Action/Foreground/etc. by mapping the derived state-group list; no group gets custom JSX because it is "the main state."
- Keep `sourceId` / fixture-source selection as a separate non-state binding when present; render the Shift Home Data family as a state group alongside Foreground.
- For stateless objects, show identity and Data source as appropriate but omit state-group rows rather than rendering an empty dropdown.
- Use the same event path for every state-group control so changing Data and changing Foreground are equivalent from the Inspector's perspective.

**Execution note:** Add Inspector tests before deleting the hardcoded State row.

**Patterns to follow:**
- `tools/theme-workshop/lab/panels/LabObjectInspector.tsx`
- `tools/theme-workshop/lab/panels/LabDeviceInspector.tsx` for uniform control rows, not for Device-axis semantics.

**Test scenarios:**
- Happy path: Game Detail shows an Action state group with Play/Continue options and no hardcoded `State` label requirement.
- Happy path: Game Detail does not show the Home-only Foreground group.
- Happy path: Shift Home shows Data and Foreground as peer controls.
- Happy path: changing each control calls the same state-group binding path with the correct group id and value.
- Edge case: stateless atom renders no state-group controls.
- Edge case: object with sparse stored values falls back to the group's declared default for display.
- Accessibility: each rendered state-group select has an accessible label based on the group label and story name.

**Verification:**
- Inspector tests prove no special primary State row remains.
- Manual lab behavior should show all state groups stacked consistently in the Inspector.

---

### U4. Update Shift page-part rendering to consume named state groups

**Goal:** Make Shift's page-part renderer consume the unified state-group values while preserving real-edge Home behavior and selected-story rendering for non-Home pages.

**Requirements:** R4, R5, R6

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `tools/theme-workshop/lab/adapters/shift-surface-part.tsx`
- Modify: `tools/theme-workshop/lab/adapters/shift-surface-part.test.tsx`
- Modify: `tools/theme-workshop/lab/adapters/shift.test.ts`
- Modify: `product/surfaces/web/shift/ShiftHome.page.part.tsx` only if metadata needs a clearer group label
- Modify: `product/surfaces/web/shift/ShiftGameDetail.page.part.tsx` only if metadata needs a clearer group label

**Approach:**
- Update the render binding passed to `renderShiftSurfacePart` so it receives the state-group map rather than separate primary and extra fields.
- For Shift Home, use the variant-selecting group value to select the catalog source layer and the Foreground group value to select the foreground source layer.
- Keep Launch produced by pressing Play with the in-memory launcher; do not add a Launch group for Compose unless a real app edge exists for it.
- Keep non-Home page parts rendering their selected story so Game Detail does not fall back to Home.

**Execution note:** Preserve and expand the regression that caught every selected page rendering Home.

**Patterns to follow:**
- `tools/theme-workshop/lab/adapters/shift-surface-part.tsx`
- `tools/theme-workshop/lab/adapters/shift-surface-part.test.tsx`
- `tools/theme-workshop/lab/seed/shift-seed.ts`

**Test scenarios:**
- Happy path: Shift Home Ready renders the selected fixture library through the real catalog edge.
- Happy path: Shift Home Empty uses the Data group and renders the empty body.
- Happy path: Shift Home Ready + Foreground Running renders foreground blocking feedback.
- Happy path: Game Detail Play/Continue renders the selected Game Detail page part and does not render Home.
- Integration: pressing Play in a render-only Home object still produces launch feedback, and Launch does not appear as an injected state group.
- Edge case: missing group values fall back to declared group defaults rather than crashing or rendering a blank page.

**Verification:**
- `shift-surface-part.test.tsx` covers Data, Foreground, non-Home page, and launch-produced behavior with the new binding shape.

---

### U5. Clean up compatibility names and documentation

**Goal:** Remove stale terminology that implies one main State plus extra axes, and update only the guidance needed for the changed state-group contract.

**Requirements:** R2, R3, R4, R7

**Dependencies:** U1, U2, U3, U4

**Files:**
- Modify: `tools/theme-workshop/lab/AGENTS.md`
- Modify: `tools/theme-workshop/AGENTS.md` only if the first-principle wording needs clarification
- Modify: `tools/theme-workshop/lab/surface-registry.ts`
- Modify: comments in `tools/theme-workshop/lab/model/lab-canvas-state.ts`
- Modify: comments in `tools/theme-workshop/lab/panels/LabObjectInspector.tsx`

**Approach:**
- Rename or clearly document any remaining adapter API names that say `axis` when the concept is now Compose object state groups.
- Update lab guidance where existing text would otherwise misdescribe the changed adapter/object contract.
- Reiterate that Device `LabStateAxis` remains a separate live Inspect⇄Live mechanism.
- Defer broader future-facing lab guidance beyond the renamed contract unless implementation makes the current docs immediately misleading.
- Remove comments that describe `stateId` as the primary Data state if that field no longer exists.

**Patterns to follow:**
- `tools/theme-workshop/AGENTS.md`
- `tools/theme-workshop/lab/AGENTS.md`

**Test scenarios:**
- Test expectation: none for prose-only documentation updates, beyond the type/tests already covering renamed APIs.

**Verification:**
- Documentation and comments consistently say state groups for Compose objects and live axes for Device surfaces.
- Grepping touched lab code no longer finds comments describing the Inspector as primary `State` plus extra axes.

---

## System-Wide Impact

- **Interaction graph:** Parts panel selection creates Compose object instances; object instances feed the board renderer and the selected-object Inspector; adapters convert selected state-group values into real edge data for page parts.
- **Error propagation:** Missing or invalid group values should fall back to declared defaults or existing safe rendering behavior; they should not crash the board or silently render Home for unrelated pages.
- **State lifecycle risks:** Instance reconciliation must not leak stale group values when a selected story changes, and changing one group must not reset unrelated groups or object position.
- **API surface parity:** `LabSurfaceAdapter` and `renderSurfacePart` are internal lab extension surfaces; update Shift and any tests that implement those contracts together.
- **Integration coverage:** Shift Home Data×Foreground behavior and Game Detail page selection must be covered through adapter tests because they cross model, inspector, adapter, and render layers.
- **Unchanged invariants:** Product runtime must not import lab runtime modules; Device live axes remain separate; Launch remains produced by real Play behavior.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| The model migration breaks all placed-object rendering at once. | Add the pure derivation helper first, then migrate the object model with focused canvas and adapter tests. |
| The variant-selecting group becomes hidden special logic under a new name. | Make its role explicit in the state-group model but render it identically in the Inspector. |
| Adapter-owned groups appear on parts that cannot consume them. | Make adapters filter by story and add tests for non-fill parts. |
| Device live axes accidentally get folded into Compose object state groups. | Keep `LabStateAxis` and `useLabAxisController` out of scope and call that out in docs/tests. |
| Defaults become inconsistent across groups. | Store per-group defaults in the derived group list and test new-instance creation. |
| Game Detail remains fixture-backed while Home uses real edge data. | Document the distinction: both are still last-mile data inputs; a real play-history edge is deferred until production owns that state. |

---

## Documentation / Operational Notes

- No user-facing docs or runtime rollout are needed; this is dev-lab internal behavior.
- The lab guidance should be updated because future surface adapters will copy this pattern.
- The user should visually verify in `just dev-lab`: select Home and Game Detail page parts, select objects on the Compose board, and confirm the Inspector shows peer state-group controls rather than a privileged State row.

---

## Sources & References

- Related code: `tools/theme-workshop/lab/panels/LabObjectInspector.tsx`
- Related code: `tools/theme-workshop/lab/model/lab-canvas-state.ts`
- Related code: `tools/theme-workshop/lab/model/lab-part-model.ts`
- Related code: `tools/theme-workshop/lab/surface-registry.ts`
- Related code: `tools/theme-workshop/lab/adapters/shift.ts`
- Related code: `tools/theme-workshop/lab/adapters/shift-surface-part.tsx`
- Related code: `product/surfaces/web/shift/ShiftHome.page.part.tsx`
- Related code: `product/surfaces/web/shift/ShiftGameDetail.page.part.tsx`
- Guidance: `tools/theme-workshop/AGENTS.md`
- Guidance: `tools/theme-workshop/lab/AGENTS.md`
- Learning: `docs/solutions/best-practices/derive-component-states-from-state-machines-2026-06-25.md`
- Learning: `docs/solutions/best-practices/control-driven-storybook-coverage-for-combinatorial-components-2026-05-01.md`
