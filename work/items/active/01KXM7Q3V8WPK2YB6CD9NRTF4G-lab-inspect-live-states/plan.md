---
title: "feat: Unify dev-lab pages into one Inspect/Live state model"
type: feat
status: active
date: 2026-06-26
verify_command: "bun test tools/theme-workshop/lab product/surfaces/web/shift product/surfaces/web/pico"
---

# feat: Unify dev-lab pages into one Inspect/Live state model

## Summary

Replace the fragmented "one page per state" representation in `just dev-lab` with **one part per page** that carries its real state-machine **axes**, and introduce a single global **Inspect ⇄ Live** mode that is the *only* difference between a frozen, addressable state and the running, navigable surface. The enabling mechanism already exists and is proven on Shift's launch axis: a **cross-root preview singleton that the live route consults** (`preview ?? real`). This plan generalises that seam to the catalog-data axis, teaches the lab a multi-axis state model, collapses the redundant page parts into their screens, and wires the global mode + a "go live from here" handoff — then ports the same model to Pico. It is sequenced as a single big-bang implementation.

---

## Problem Frame

In the lab's Parts view, the Shift `page` layer shows **Game Detail, Home, Home · Data states, Home · Launch states** — three "Homes" for what is conceptually one page. They exist because (a) Home has **two orthogonal-but-nested state machines** (catalog **data** state and **launch** state) and the lab's state model only supports a single flat state axis per part, so each axis was authored as its own demo gallery part; and (b) the surface's screens are *also* surfaced as isolated parts, duplicating the navigable Home. Separately, the dock States panel and the "navigate vs isolate" experiences feel like they should be one object viewed two ways, not three different objects. The user's mental model is: **one Home, that I can either drive live or pin to a moment** — and ideally hand off between the two from any coordinate.

The architecture is unusually ready for this: lab "states" here are *real seeds fed into the real machine* (`stateVariants(machine, samples)`), the Surface mount already has a `makeSeedInitialValuesForBinding` seam, and Shift's launch axis **already implements Inspect↔Live** end to end via `setShiftLaunchPreview` + the live route's `preview ?? launch.state`.

---

## Assumptions

*This plan was authored from an extended in-session design conversation (no separate requirements doc) and verified against the live code, but without a separate synchronous confirmation pass on the unit breakdown. The load-bearing bets:*

- The data axis can reach Inspect↔Live parity by mirroring the launch singleton (a `shift-catalog-preview` consulted by `ShiftHomeRoute`) rather than seeding source layers. Source-layer seeds (empty/failing library) for "live boots non-Ready and the real machine *sits* there" are **deferred**; singleton-persist-until-released covers the primary need.
- It is acceptable for `ShiftHomeRoute`/`ShiftGameDetailRoute` (product runtime) to consult a preview singleton, because it is inert in production (nothing sets it) — exactly the precedent `shift-launch-preview.ts` already sets.
- Page-layer parts become the surface's **screens** (mounted live on one device); atoms/molecules/organisms stay static isolated renders.

---

## Requirements

- R1. **One part per page.** Collapse the three Shift "Home" entries (and the redundant standalone screen parts) into a single Home page part; Game Detail likewise. No duplicate page parts in the tree.
- R2. **Multi-axis state model.** A page part exposes its real state-machine **axes** (Shift Home: **Data** = `ShiftCatalogState`, **Launch** = `LaunchState`), each derived from machine tags, shown as grouped axes in the States panel. No fixed/global state vocabulary.
- R3. **Inspect ⇄ Live as one mode on one object.** A single global toggle. **Live** releases axes and lets the mounted surface run and navigate; **Inspect** applies the pinned coordinate. Switching a single axis between pinned and live needs **no remount**.
- R4. **Preview-singleton parity for the data axis.** A cross-root catalog-preview singleton consulted by the live route (`preview ?? live`), mirroring `shift-launch-preview`. A pin persists until released; retry/refresh runs the real loader.
- R5. **Coordinate handoff ("go live from here").** Releasing the chosen axes hands control to the real machine in place; the **route is part of the coordinate** (the Screen dropdown is the route axis), so any (screen × state) is an addressable starting point.
- R6. **Nested axes honored.** The Launch axis is only meaningful when Data = Ready; the States panel greys/disables it otherwise.
- R7. **Matrix fans an axis.** The Matrix view lays out every value of a chosen axis (and the cross-product of two axes) side by side, using seeded static renders.
- R8. **Capture-back (Live → Inspect).** From a running surface, "Pin current" reads the surface's current coordinate `{ route, data tag, launch tag }` and sets the axes.
- R9. **Pico parity.** The same axis model applies to Pico's `PicoData` data states.
- R10. **No product regressions / boundaries preserved.** Product runtime must not import dev-lab runtime modules; previews stay offline/fixture-backed; existing Surface-mount, calibration, and discovered-parts behavior keep working.

**Origin actors:** the design-tool user (driving the lab); surface authors (own the screens, machines, and sample tables).
**Origin flows:** Inspect a pinned coordinate → Go Live → navigate; Live exploration → Pin current → Inspect.

---

## Scope Boundaries

- Not adding new product surfaces or screens; only re-expressing existing Shift/Pico screens and their state machines.
- Not changing the atomic-design discovery convention for atoms/molecules/organisms/templates (they remain static isolated renders).
- Not building deep-link/shareable coordinates (URL-encoding a full coordinate) in this plan.
- Boxbuster gets no axes (it has no state-machine parts); it must keep working unchanged.

### Deferred to Follow-Up Work

- **Source-layer seeds for non-Ready Live** (empty/failing/slow library layers so the *real* loader produces and sits in a non-Ready state): future iteration. The singleton (pin-persists-until-released + retry-runs-loader) is the v1 mechanism.
- **Durable/shareable coordinates** (encode `{route, axis pins}` into the lab URL): future iteration.
- **Interactive-while-pinned** ("freeze Data=Empty but still scroll/click"): the singleton already permits it; exposing it as an explicit per-axis interactivity control is deferred.

---

## Context & Research

### Relevant Code and Patterns

- **The proven seam (template):** `product/surfaces/web/shift/shift-launch-preview.ts` — a cross-root singleton (`setShiftLaunchPreview`/`useShiftLaunchPreview`, `launchStateSamples` keyed by tag, `LAUNCH_LIVE_TAG`), inert in production.
- **Live route already consults it:** `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx` — `NavigatingReadyBody` uses `const raw = preview ?? launch.state`; data comes from `useAtomValue(catalogSnapshotAtom)` with `useAtomRefresh` wired to `onRetry`.
- **Data axis source-of-truth:** `product/surfaces/web/shift/shift-catalog-state-samples.ts` (`shiftCatalogStateSamples`, exhaustive by `ShiftCatalogState` tag) and the derived effect atom `product/platform/react/catalog/catalog-atoms.ts` (`catalogSnapshotAtom`).
- **The three page parts to collapse:** `product/surfaces/web/shift/pages/ShiftScreens.page.part.tsx`, `ShiftCatalogHomeStates.page.part.tsx`, `ShiftCinematicHomeStates.page.part.tsx`.
- **Lab surface adapter contract:** `tools/theme-workshop/lab/surface-registry.ts` (`LabSurfaceAdapter`, `screens`, `makeSeedInitialValuesForBinding`, `previewScope`); adapters `tools/theme-workshop/lab/adapters/{shift,pico,boxbuster}.ts`.
- **Lab state/render layer:** `tools/theme-workshop/lab/model/{lab-source-state.ts,lab-part-model.ts,lab-canvas-state.ts}`, `tools/theme-workshop/lab/panels/LabStatesPanel.tsx`, `tools/theme-workshop/lab/LabShell.tsx`, `tools/theme-workshop/lab/canvas/{LabCanvasContent,LabSelectionView,LabSurfaceView,LabPartPreview,LabMatrixView}.tsx`, `tools/theme-workshop/lab/parts-discovery.ts`.
- **Pico equivalents:** `product/surfaces/web/pico/screens/{PicoData.tsx,PicoDataState.ts,PicoDataStates.page.part.tsx}`; pico settings cross-root singleton (referenced by the launch-preview comment as the pattern Pico already mirrors).
- **Boundary guard to keep green:** `tools/theme-workshop/lab/lab-boundary.test.ts` (product runtime must not import dev-lab runtime).

### Institutional Learnings

- No matching `docs/solutions/` entry found for this work. The "derive-don't-author" / `stateVariants` pattern (machine `.tags` are the enumeration) is the in-repo convention this plan must keep honoring (`product/platform/state/state-variants.ts`).

### External References

- None required; the work is entirely against in-repo patterns the codebase already establishes.

---

## Key Technical Decisions

- **Universal seam = a preview singleton the live route consults (`preview ?? real`).** Generalise `shift-launch-preview` to the data axis instead of seeding/overriding the derived `catalogSnapshotAtom` (which is a refreshable effect atom and not cleanly seedable). Rationale: gives both axes identical, remount-free Inspect↔Live; reuses the existing, production-inert precedent; the sample tables drive both the inspect render and the live pin, so the two can never drift.
- **Axes are adapter-declared, surface-owned.** The lab learns a `LabStateAxis` shape; the adapter wires each axis's `pin(tag)`/`release()` to the surface's singleton + sample table, and lists each axis's states from the machine tags. Rationale: the singletons are surface-specific; keeping axis wiring in the adapter preserves the lab↔product boundary and the derive-don't-author rule.
- **Page parts ARE the screens (mounted); atoms stay static.** Selecting a page part mounts the live surface at its route on one device with the axis controls; the Screen dropdown is the route axis. Rationale: this is the unification the user asked for ("navigate" and "isolate" become one object in two modes), and it makes "go live and navigate from here" fall out for free because the mounted route already consults the singletons.
- **Global Inspect ⇄ Live with per-axis Live values.** A headline global toggle (release-all / restore-pins) plus a per-axis "Live" value for the powerful in-between (pin Data, release Launch). Rationale: matches the seam already built for launch and the user's stated preference (global headline).
- **Nesting is surfaced, not hidden.** Launch axis `enabledWhen` Data = Ready; greyed otherwise. Rationale: honest to the real machine composition (cinematic home only exists in the Ready body).

---

## Open Questions

### Resolved During Planning

- *Can the data axis reach launch-axis parity?* Yes — `ShiftHomeRoute` already reads `catalogSnapshotAtom` then composes; inserting `useShiftCatalogPreview() ?? snapshot` mirrors the launch override exactly.
- *Is overriding `catalogSnapshotAtom` viable?* No — it is a refreshable runtime effect atom; the singleton seam is the right mechanism, with `refreshSnapshot` as the "retry → live" path.
- *Where do axes live?* In the adapter (surface-owned), driving product singletons + sample tables.

### Deferred to Implementation

- Exact `LabStateAxis` field names and the adapter method shape (`axesForPart(storyId)` vs static `axes` map) — settle when wiring U3 against the real selection flow.
- Whether Game Detail needs any axis (likely none initially) — confirm when U5 mounts it.
- Whether the single-device mount for a page part should reuse `LabSurfaceView`'s frame or a slimmer `LabScreenView` — decide when implementing U5.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

A **coordinate** addresses a moment: `{ route, dataAxis ∈ {Live | tag}, launchAxis ∈ {Live | tag} }`. Inspect *sets* it; Live *discovers* it. Both the frozen render and the running app read the **same singletons**, so there is no gap to bridge.

```text
                 ┌──────────────── lab (tools/theme-workshop/lab) ────────────────┐
  Parts (left) ─ pick page part ─► Selection mounts the surface @ route (1 device)
  States (right): AXES for this part
     Data  : [Live] Loading Ready Empty LoadError Defect      pin(tag)/release()
     Launch: [Live] Idle Launching … (enabled iff Data=Ready) pin(tag)/release()
  Global toggle:  Inspect ─────────────────────────────► Live
                  (apply pins)                            (release all; navigate)
                 └───────────────┬───────────────────────────────────────────────┘
                                 │ adapter.axes wire pin/release →
                                 ▼
   product singletons (inert in prod):  setShiftCatalogPreview(sample) / setShiftLaunchPreview(sample)
                                 ▼
   live route:  snapshot = useShiftCatalogPreview() ?? useAtomValue(catalogSnapshotAtom)
                launch   = preview ?? launch.state            (already present)
```

Axis state-lists derive from machine tags (`ShiftCatalogState.tags`, `LaunchState` tags); the sample tables (`shiftCatalogStateSamples`, `launchStateSamples`) supply the pinned values **and** the Matrix fan-out renders.

---

## Implementation Units

### U1. Catalog-data preview singleton (Shift)

**Goal:** Give the data axis the same cross-root preview seam the launch axis has.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Create: `product/surfaces/web/shift/shift-catalog-preview.ts`
- Test: `product/surfaces/web/shift/shift-catalog-preview.test.ts`

**Approach:**
- Mirror `shift-launch-preview.ts`: a module singleton holding `CatalogResult | null`, `setShiftCatalogPreview(next)`, `useShiftCatalogPreview()` via `useSyncExternalStore`, subscriber set. Inert in production (returns null unless a design tool sets it).
- Re-export / reference the existing `shiftCatalogStateSamples` as the canonical pin values (do not author new samples).

**Patterns to follow:**
- `product/surfaces/web/shift/shift-launch-preview.ts` (structure, server-snapshot returning null, doc comment about production inertness).

**Test scenarios:**
- Happy path: default `useShiftCatalogPreview()` is null; `setShiftCatalogPreview(sample)` then read returns the sample.
- Edge case: subscribers are notified on set and on clear; `setShiftCatalogPreview(null)` returns to null.
- Edge case: server snapshot path returns null (SSR-safe), matching the launch singleton.

**Verification:** The singleton compiles, is import-clean from product, and its unit test passes; no consumer yet.

---

### U2. Live routes consult the catalog-preview singleton

**Goal:** Make the live Home/Game Detail render `preview ?? realSnapshot`, so a pin shows instantly and releasing returns to the real loader — no remount.

**Requirements:** R3, R4, R5

**Dependencies:** U1

**Files:**
- Modify: `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx`
- Modify: `product/surfaces/web/shift/routes/ShiftGameDetailRoute.tsx`
- Test: `product/surfaces/web/shift/routes/shift-catalog-preview-route.test.tsx`

**Approach:**
- In each route, compose `const live = useAtomValue(catalogSnapshotAtom); const snapshot = useShiftCatalogPreview() ?? live`. Keep `onRetry={refreshSnapshot}` (retry runs the real loader → the "pin then go live" door).
- Confirm the launch override remains `preview ?? launch.state` and that launch only matters in the Ready body (the nesting R6 depends on).

**Patterns to follow:**
- The existing `preview ?? launch.state` line in `ShiftHomeRoute.tsx`.

**Test scenarios:**
- Covers R4. Happy path: mount the live home; `setShiftCatalogPreview(Empty)` → empty body renders; `setShiftCatalogPreview(null)` → Ready body resolves from the real (seeded) loader.
- Error path: `setShiftCatalogPreview(LoadError)` → error body renders with a wired Retry; invoking Retry runs `refreshSnapshot` (real loader) and leaves the pinned error.
- Integration: with Data pinned Ready, `setShiftLaunchPreview(Launching)` drives the cinematic home's launch overlay (both axes ride together at Data=Ready); with Data=Empty, the launch pin is inert (no cinematic home present) — encodes R6.

**Verification:** The route test proves pin → release → live and pin → retry → live for the data axis, with launch riding along only at Ready.

---

### U3. Lab multi-axis state model + adapter axis declaration

**Goal:** Teach the lab that a part can have multiple named state **axes**, each Live-or-pinned, and let the adapter declare them wired to the surface singletons.

**Requirements:** R2, R3, R6

**Dependencies:** U1, U2

**Files:**
- Create: `tools/theme-workshop/lab/model/lab-state-axis.ts`
- Modify: `tools/theme-workshop/lab/surface-registry.ts` (extend `LabSurfaceAdapter` with axis declaration)
- Modify: `tools/theme-workshop/lab/adapters/shift.ts` (declare Data + Launch axes wired to `setShiftCatalogPreview`/`setShiftLaunchPreview` + sample tables)
- Test: `tools/theme-workshop/lab/model/lab-state-axis.test.ts`
- Test: `tools/theme-workshop/lab/adapters/shift.test.ts` (extend)

**Approach:**
- Define `LabStateAxis`: `{ id, label, liveLabel, states: {id,label}[], pin(stateId), release(), enabledWhen?(active) }` plus a `LIVE` sentinel. States derive from machine tags (keep derive-don't-author).
- Add an adapter seam, e.g. `axesForPart(storyId): readonly LabStateAxis[]` (or a static map keyed by screen id) — Shift Home → `[Data, Launch(enabledWhen Data=Ready)]`, Game Detail → `[]` (confirm in U5).
- Shift Data axis: `states` from `ShiftCatalogState.tags`; `pin(tag) = setShiftCatalogPreview(shiftCatalogStateSamples[tag]())`; `release() = setShiftCatalogPreview(null)`. Launch axis analogously over `launchStateSamples`.

**Patterns to follow:**
- `tools/theme-workshop/lab/model/lab-source-state.ts` (option shapes), the existing `statesForStory` derivation in `lab-part-model.ts`, and `LAUNCH_STATE_VARIANTS` for label derivation.

**Test scenarios:**
- Happy path: `axesForPart("shift home")` returns Data + Launch with state lists matching the machine tags (exhaustive).
- Edge case: Launch axis `enabledWhen` returns false unless Data active = Ready.
- Integration: calling Data `pin("Empty")` invokes `setShiftCatalogPreview` with the Empty sample; `release()` clears it (spy/mock the singleton).
- Edge case: a surface with no axes (Boxbuster) returns `[]` and nothing breaks.

**Verification:** Axis declarations resolve from machine tags and drive the singletons; boundary test stays green (adapter→product import only).

---

### U4. States panel as axis groups + global Inspect/Live state in the shell

**Goal:** Render axes as grouped controls (each with a Live chip + its states, greyed when disabled), and hold the global Inspect/Live + per-axis active values in the shell.

**Requirements:** R2, R3, R6

**Dependencies:** U3

**Files:**
- Modify: `tools/theme-workshop/lab/panels/LabStatesPanel.tsx`
- Modify: `tools/theme-workshop/lab/LabShell.tsx` (axis state: `activeByAxis`, global `mode`, apply/release wiring)
- Test: `tools/theme-workshop/lab/panels/LabStatesPanel.test.tsx`

**Approach:**
- States panel takes `axes` + `activeByAxis` + `mode`; renders one group per axis with a **Live** chip and the axis's states; disabled axes render greyed with a reason.
- Shell computes axes for the selected page part (U3), tracks `activeByAxis` (each value = `LIVE` or a tag) and a global `mode` (`inspect`/`live`); selecting a state pins that axis (calls `axis.pin`), Live releases it (`axis.release`).
- Replace the current single-flat-`statesForStory` panel path for axis-bearing parts; keep a graceful empty state for axis-less parts.

**Patterns to follow:**
- Current `LabStatesPanel.tsx` row styling + `selectState` flow in `LabShell.tsx`.

**Test scenarios:**
- Happy path: selecting Home shows two axis groups with the right states; clicking a Data state marks it active and calls its `pin`.
- Edge case: Launch group is greyed and non-interactive while Data≠Ready; becomes active when Data=Ready.
- Edge case: an axis-less part shows the empty hint (no crash).
- Integration: toggling global Live calls `release()` on every axis; toggling back to Inspect re-applies the remembered pins.

**Verification:** The panel reflects real axes and drives pin/release; greying matches `enabledWhen`.

---

### U5. Page parts mount the live surface at their route (one part per page)

**Goal:** Make a selected `page` part the mounted surface at its route on one device, with the axis controls — converging "navigate" and "isolate" onto one object. Atoms stay static.

**Requirements:** R1, R3, R5

**Dependencies:** U4

**Files:**
- Create: `tools/theme-workshop/lab/canvas/LabScreenView.tsx` (single-device mounted page at a route)
- Modify: `tools/theme-workshop/lab/canvas/LabCanvasContent.tsx` (route page parts → `LabScreenView`; atoms → existing static `LabPartPreview`)
- Modify: `tools/theme-workshop/lab/canvas/LabSelectionView.tsx` / `tools/theme-workshop/lab/LabShell.tsx` as needed to pass route + axis context
- Test: `tools/theme-workshop/lab/canvas/LabScreenView.test.tsx`

**Approach:**
- A page part resolves to a screen (route) from `adapter.screens`; `LabScreenView` mounts via the existing `LabSurfaceMount` on one device, honoring the global singletons (so it reflects pins automatically).
- Reuse `LabSurfaceView`'s frame/scope handling where possible (height-pinning, device frame); decide reuse-vs-slim in implementation.
- Atoms/molecules/organisms keep the static `LabPartPreview` path unchanged.

**Patterns to follow:**
- `tools/theme-workshop/lab/canvas/LabSurfaceView.tsx` (mount + device frame + the shift home-frame height pin in `lab-shell.css`), `LabSurfaceMount`.

**Test scenarios:**
- Happy path: selecting Home mounts the home route on one device and renders the real home; pinning Data=Empty (via U4) shows the empty body in the mount.
- Integration: switching the Screen dropdown changes the mounted route (Home ↔ Game Detail) within the same selection.
- Edge case: an atom selection still uses the static preview (no mount).
- Integration: mounting does not call external art endpoints (offline/fixture-backed preserved).

**Verification:** Page parts render as the live mounted screen reflecting axis pins; atoms unchanged.

---

### U6. Remove the redundant standalone page parts; sample tables become axis sources

**Goal:** Eliminate the duplicate "Home"/"Game Detail"/state-family page parts so the page layer shows exactly one part per screen.

**Requirements:** R1, R10

**Dependencies:** U5

**Files:**
- Delete: `product/surfaces/web/shift/pages/ShiftScreens.page.part.tsx`
- Delete: `product/surfaces/web/shift/pages/ShiftCatalogHomeStates.page.part.tsx`
- Delete: `product/surfaces/web/shift/pages/ShiftCinematicHomeStates.page.part.tsx`
- Modify: any tests asserting these parts/part-counts (e.g. discovery/grounding tests under `tools/theme-workshop/lab/`)
- Keep: `shift-catalog-state-samples.ts` and `launchStateSamples` (now axis sources, referenced by U3)

**Approach:**
- The page layer is now sourced from `adapter.screens` (U5), so the standalone `*.page.part.tsx` wrappers are redundant; remove them but preserve the sample tables they wrapped.
- Update the parts-discovery / part-model tree so page parts come from screens, not discovered `*.page.part.tsx` (confirm discovery still finds atoms/molecules/etc).
- Adjust the `partLabel`/family-collapse logic added earlier (`lab-part-model.ts`) since families are gone for these pages.

**Patterns to follow:**
- `tools/theme-workshop/lab/parts-discovery.ts` and `tools/theme-workshop/lab/model/lab-part-model.ts` (current discovery + collapse).

**Test scenarios:**
- Happy path: Shift Parts tree page layer = `Home`, `Game Detail` only.
- Edge case: atoms/molecules/organisms/templates still discovered and rendered.
- Integration: removing the product part files does not break product builds/tests; sample tables still import cleanly.

**Verification:** Exactly one page part per screen; no orphaned imports; discovery green.

---

### U7. Global Inspect ⇄ Live toggle + "go live from here"

**Goal:** Surface the global mode in the chrome and make Live hand the running app the wheel from the current coordinate.

**Requirements:** R3, R5

**Dependencies:** U4, U5

**Files:**
- Modify: `tools/theme-workshop/lab/chrome/LabTopBar.tsx` (Inspect ⇄ Live control)
- Modify: `tools/theme-workshop/lab/LabShell.tsx` (mode wiring; on Live, release axes / keep route; on Inspect, re-apply pins)
- Test: `tools/theme-workshop/lab/LabRoot.test.tsx` (extend) or new shell test

**Approach:**
- Global toggle releases all axes (clear singletons) on Live and re-applies remembered pins on Inspect; the route axis (Screen dropdown) stays as-is so navigation continues from the pinned screen.
- Optional per-axis Live values already exist via U4 (release one axis, keep another pinned) — the "powerful in-between."
- Naming: the mode label is **Inspect/Live**; do not collide with the existing Dock/Float/**Focus** chrome layout modes.

**Patterns to follow:**
- `LabTopBar.tsx` segmented controls; `LabShell.tsx` state wiring.

**Test scenarios:**
- Happy path: with Home pinned to Data=Empty, toggling Live clears the catalog preview (singleton spy) and the mounted home runs the real loader; route stays Home.
- Integration: toggling Live then navigating via the Screen dropdown moves Home → Game Detail in the running mount.
- Edge case: re-entering Inspect restores the prior pins.

**Verification:** One global control flips the whole selection between pinned and running; "go live from here" keeps the route and releases axes.

---

### U8. Matrix view fans out an axis (and cross-product)

**Goal:** Make Matrix lay out every value of a chosen axis side by side (seeded static renders), and the cross-product when two axes are chosen.

**Requirements:** R7

**Dependencies:** U3

**Files:**
- Modify: `tools/theme-workshop/lab/canvas/LabMatrixView.tsx`
- Test: extend matrix coverage (co-located test or `tools/theme-workshop/lab/canvas/LabMatrixView.test.tsx`)

**Approach:**
- Axis selectors choose row/column axes from the part's `LabStateAxis` list; each cell renders the seeded sample for that (axis-value[, axis-value]) via the static preview path (not a live mount, for cost).
- Honor nesting: a Launch column at Data≠Ready renders the appropriate "not applicable" cell.

**Patterns to follow:**
- Current `LabMatrixView.tsx` axis/scroll/cell structure and `LabPartPreview` seeded render.

**Test scenarios:**
- Happy path: Matrix of the Data axis shows one cell per data state.
- Integration: cross-product Data × Launch renders cells; Launch cells at Data≠Ready show the not-applicable state.
- Edge case: a part with one axis hides the second selector gracefully.

**Verification:** Matrix fans the real axis values from the sample tables; cross-product and nesting render correctly.

---

### U9. Capture-back: "Pin current" from a running surface

**Goal:** Let a live exploration become an addressable Inspect coordinate by reading the surface's current `{ route, data tag, launch tag }`.

**Requirements:** R8

**Dependencies:** U2, U4

**Files:**
- Create: `product/surfaces/web/shift/shift-current-coordinate.ts` (read current data tag via `catalogSnapshotAtom`/preview, launch tag via `preview ?? launch.state`, route)
- Modify: `tools/theme-workshop/lab/LabShell.tsx` (a "Pin current" action that maps the coordinate onto `activeByAxis` + route)
- Test: `product/surfaces/web/shift/shift-current-coordinate.test.tsx`

**Approach:**
- The surface exposes a read of its current coordinate (values already exist in-app); the lab maps tags back to axis pins and the route to the Screen dropdown, flipping the global mode to Inspect.
- Keep the reader product-side (no dev-lab import into product); the lab consumes it through the adapter.

**Patterns to follow:**
- `useShiftLaunchPreview`/`catalogSnapshotAtom` reads already present in `ShiftHomeRoute.tsx`.

**Test scenarios:**
- Happy path: with the running home at Ready+Launching, "Pin current" sets Data=Ready, Launch=Launching, route=Home, mode=Inspect.
- Edge case: at a non-Ready data state, Launch maps to its inert/Live value (nesting).
- Integration: after capture, toggling Live releases back to the same running state (round-trip).

**Verification:** A live coordinate becomes a reproducible Inspect pin; round-trips with Go Live.

---

### U10. Pico parity (data axis)

**Goal:** Apply the same axis model + preview seam to Pico's `PicoData` states.

**Requirements:** R9

**Dependencies:** U3

**Files:**
- Create: `product/surfaces/web/pico/pico-data-preview.ts` (mirror the catalog/launch singleton, reusing Pico's existing settings-singleton pattern)
- Modify: `product/surfaces/web/pico/screens/PicoData.tsx` (consult `preview ?? real`)
- Modify: `tools/theme-workshop/lab/adapters/pico.ts` (declare the Data axis)
- Delete: `product/surfaces/web/pico/screens/PicoDataStates.page.part.tsx` (now an axis, not a part); keep its sample table
- Test: `product/surfaces/web/pico/pico-data-preview.test.tsx`; extend `tools/theme-workshop/lab/adapters/pico.test.ts`

**Approach:**
- Mirror U1/U2/U3 for Pico: a data preview singleton consulted by `PicoData`, a Data axis declared in the Pico adapter from `PicoDataState.tags` + the existing Pico samples; remove the redundant Pico data-states page part.
- Pico's launch/settings singleton already exists; only the data axis is new.

**Patterns to follow:**
- U1–U3 for Shift; Pico's existing settings cross-root singleton.

**Test scenarios:**
- Happy path: Pico Data axis lists `PicoDataState.tags`; pinning drives the Pico data preview singleton; the live `PicoData` reflects it.
- Edge case: clearing returns Pico to its real data state.
- Integration: Pico Parts page layer shows one entry per screen (no `Library · …` family).

**Verification:** Pico has the same single-part + data-axis behavior as Shift Home (minus Launch).

---

### U11. Boundary, regression, and docs sweep

**Goal:** Lock the boundary, refresh affected tests/docs, and confirm no product regressions.

**Requirements:** R10

**Dependencies:** U1–U10

**Files:**
- Modify: `tools/theme-workshop/lab/lab-boundary.test.ts` (confirm product preview singletons are product-side; lab imports product, not vice-versa)
- Modify: any grounding/part-count or `LabRoot`/discovery tests touched by U5/U6/U10
- Modify: `tools/theme-workshop/lab/AGENTS.md` (or nearest) — document the axis/Inspect-Live/preview-singleton model
- Test: full lab + shift + pico suites and the lab vite build

**Approach:**
- Verify the boundary guard still passes (preview singletons live in `product/`, consumed by routes; the lab adapter is the only lab→product bridge).
- Update or remove tests that assumed the old three-part Home / flat-state model.
- Add a short AGENTS note describing axes, the Inspect/Live mode, and the preview-singleton seam so future surface authors follow it.

**Patterns to follow:**
- Existing `lab-boundary.test.ts`, `parts-discovery.test.ts`, `LabRoot.test.tsx`.

**Test scenarios:**
- Integration: `bun test tools/theme-workshop/lab product/surfaces/web/shift product/surfaces/web/pico` is green.
- Integration: boundary test proves no product runtime file imports a dev-lab runtime module.
- Test expectation: none for the AGENTS doc edit — documentation only.

**Verification:** Full focused suites + lab vite build pass; boundary green; docs updated.

---

## System-Wide Impact

- **Interaction graph:** product routes (`ShiftHomeRoute`, `ShiftGameDetailRoute`, `PicoData`) gain a `preview ?? real` read; lab `LabShell`/`LabStatesPanel`/`LabCanvasContent`/`LabMatrixView` gain the axis model; adapters bridge to product singletons.
- **Error propagation:** the data axis's `LoadError`/`Defect` pins must render the real error bodies with a wired retry; retry runs the real loader (no swallowed failures).
- **State lifecycle risks:** preview singletons are global/cross-root — ensure they are released on Live and reset between surface switches so a stale pin doesn't leak across surfaces/sessions.
- **API surface parity:** the same seam is applied to Shift (Data+Launch) and Pico (Data); Boxbuster intentionally has no axes and must be unaffected.
- **Integration coverage:** route tests (U2/U10) and the mounted-screen test (U5) prove behavior mocks can't — that pinning a singleton changes what the live machine renders, and releasing returns control.
- **Unchanged invariants:** atomic-design discovery for atoms/molecules/organisms/templates; `LabSurfaceMount` mount/dispose; calibration; offline/fixture-backed previews; the lab↔product boundary.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Global preview singletons leak a stale pin across surface/session switches | Release-all on Live and on surface change; cover with a shell test (U7) and reset in `LabShell` surface-change effect |
| Product routes consulting a design-tool singleton feels like a prod leak | It is inert in production (nothing sets it) — exact precedent of `shift-launch-preview`; documented in U11 AGENTS note |
| Removing product `*.page.part.tsx` files breaks discovery/part-count tests | U6 updates those tests in the same unit; discovery still covers atoms/molecules/etc |
| Mounting a page part per selection is heavier than a static render | Only Selection-of-a-page mounts (one device); Gallery/Matrix stay static seeded renders |
| Non-Ready "Live" doesn't truly re-run the backend (only persists the pin) | Accepted for v1 (pin-persist + retry→loader); source-layer seeds deferred and noted |
| Nested axes (Launch only at Data=Ready) confuse the UI | `enabledWhen` greys the Launch axis with a reason (U4); Matrix renders not-applicable cells (U8) |

---

## Phased Delivery

### Phase 1 — Data-axis seam (product)
- U1, U2. Lowest-risk, fully unit-tested; proves Inspect↔Live parity for the data axis before any lab UI.

### Phase 2 — Lab axis model
- U3, U4. The multi-axis model + States panel + shell state.

### Phase 3 — One part per page
- U5, U6. Page parts become mounted screens; remove the redundant standalone parts.

### Phase 4 — Mode + lenses
- U7, U8. Global Inspect/Live toggle + "go live from here"; Matrix axis fan-out.

### Phase 5 — Capture-back + Pico parity + sweep
- U9, U10, U11. Live→Inspect "Pin current"; Pico data axis; boundary/regression/docs.

---

## Documentation / Operational Notes

- Add an AGENTS note (U11) describing the **axis + Inspect/Live + preview-singleton** model so future surface authors expose new state machines the same way (one singleton consulted by the live route + a sample table + an adapter axis), keeping derive-don't-author intact.
- No runtime/ops rollout: this is dev-lab tooling plus production-inert preview seams.

---

## Sources & References

- Proven seam: `product/surfaces/web/shift/shift-launch-preview.ts`
- Live consumer: `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx`
- Data samples + atom: `product/surfaces/web/shift/shift-catalog-state-samples.ts`, `product/platform/react/catalog/catalog-atoms.ts`
- Parts to collapse: `product/surfaces/web/shift/pages/{ShiftScreens,ShiftCatalogHomeStates,ShiftCinematicHomeStates}.page.part.tsx`
- Lab seams: `tools/theme-workshop/lab/surface-registry.ts`, `tools/theme-workshop/lab/model/{lab-source-state,lab-part-model}.ts`, `tools/theme-workshop/lab/panels/LabStatesPanel.tsx`, `tools/theme-workshop/lab/canvas/{LabCanvasContent,LabSurfaceView,LabMatrixView}.tsx`
- Boundary guard: `tools/theme-workshop/lab/lab-boundary.test.ts`
- Convention: `product/platform/state/state-variants.ts` (derive-don't-author)
