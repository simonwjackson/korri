---
title: "feat: Pointer-aware spatial navigation"
type: feat
status: active
date: 2026-05-01
origin: docs/brainstorms/2026-05-01-pointer-aware-spatial-navigation-requirements.md
---

# feat: Pointer-aware spatial navigation

## Overview

Extend the existing decoupled spatial-navigation stack (`korri/shared/input/` + `korri/shared/navigation/`) so the mouse participates as a first-class input alongside keyboard and gamepad. Add two new adapters (pointer, wheel), a small input-mode store, and a single CSS rule change. The architecture documented in `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` is preserved — components stay native HTML, no new component-level navigation APIs, and adding inputs remains a single-file additive change.

The product behavior follows last-input-wins: hover focuses the tile under the cursor, the cursor hides on the first directional input from keyboard/gamepad, and the cursor reappears the moment the user moves the mouse again. Inside opted-in tilegrid containers (`data-pointer-wheel` attribute), the scroll wheel emits the same `direction` actions that keyboard arrows emit, so wheel cycles focus tile-by-tile instead of scrolling the page.

## Problem Frame

Today the navigation stack supports keyboard and gamepad. Mouse interaction works only because every focusable is a real `<button>`/`<a>` — clicks fire, but the mouse never participates in the spatial focus state, hovering does not "light up" the way arrow-key navigation does, and `:focus-visible` deliberately skips mouse-induced focus so any visible "active tile" treatment is currently keyboard/gamepad only. Korri ships to both desktop and TV-style targets, so all three input families need to share one unified focus model. *(see origin: `docs/brainstorms/2026-05-01-pointer-aware-spatial-navigation-requirements.md`)*

## Requirements Trace

Carries forward all 18 requirements from the origin document:

- R1–R5 — input-mode model (`pointer` / `directional`, exposed as `[data-input-mode]`, owned by a single source of truth, transitions only on `mousemove` ↔ `direction`).
- R6–R12 — pointer adapter (`mousemove`-driven hover focus, deepest-focusable resolution, editable-element protection, gap-tolerant focus retention, touch-pointer filtering, right-click → `options`).
- R13–R16 — wheel-as-direction adapter (opt-in via `data-pointer-wheel`, delta accumulation with threshold, native scroll preserved outside opted-in containers).
- R17–R18 — visual treatment (unified `[data-input-mode]` + `:focus` rule for spatial-nav focusables; preserve existing `:focus-visible`-keyed styling on form controls and similar surfaces where it already exists).

## Scope Boundaries

- No new component-level APIs. Components stay native HTML. The only new surface a component author touches is the `data-pointer-wheel` attribute on a grid container.
- No drag-to-select, marquee selection, or pointer-based reordering.
- No touch-input adapter beyond ignoring touch-derived pointer events. A real touch adapter (swipe → direction, long-press → options) is a separate future adapter.
- No change to keyboard or gamepad adapters' existing semantics beyond an additive `source` tag on emissions.
- No focus-ring redesign — the active-tile look stays whatever the theme already paints.
- No environment-determined mode (desktop = pointer, TV = directional). Mode is dynamic per input event in every build.
- No persistence of input mode across page loads.

### Deferred to Separate Tasks

- Real touch adapter (`korri/shared/input/touch-adapter.ts`): swipe → `direction`, long-press → `options`. Future plan.
- Cursor reappearance polish (e.g., custom cursor styling, fade-in animation): not in scope. The browser-default cursor and a binary `cursor: none` toggle are sufficient.
- A second wheel-driven consumer beyond the home tilegrid that would justify additional `data-pointer-wheel` values (e.g., `"snap"`): defer until that consumer exists.

## Context & Research

### Relevant Code and Patterns

- `korri/shared/input/types.ts` — `InputAction` union and `InputAdapter` interface. Pointer and wheel adapters implement the same interface.
- `korri/shared/input/bus.ts` — `createInputBus()`. Pure pub/sub; new adapters attach via `bus.use(adapter)` exactly like keyboard and gamepad.
- `korri/shared/input/keyboard-adapter.ts` — reference adapter shape: `start(emit)` returns disposer, listens at a configurable target, has `ignoreWhenEditable` semantics. Pointer adapter mirrors the editable-element check.
- `korri/shared/input/gamepad-adapter.ts` — reference for `requestAnimationFrame`-driven event sourcing. The wheel adapter does not need rAF (wheel events are discrete), but the dispose pattern is the same.
- `korri/shared/navigation/focus-engine.ts` — receives `direction` `InputAction`s and calls LRUD's `nextFocus`. Unchanged. Wheel adapter feeds the same engine.
- `korri/shared/navigation/start.ts` — single wiring point. Extends with optional `pointer` and `wheel` adapter options; subscribes the input-mode store to the bus.
- `korri/shared/themes/shift/shift.css` — current `:focus-visible` ring lives here (`@layer base`). The unified rule replaces it.
- `korri/shared/design-system/components/Tilegrid/TilegridScrollRoot.tsx` — host of the home-screen tilegrid; opts into wheel-as-direction.
- `korri/shared/design-system/components/Tilegrid/Tilegrid.gamepad.story.e2e.ts` — reference Playwright spec pattern for adapter E2E (install fake driver via `page.addInitScript` before storybook loads, drive via a `window.__fake*` hook, assert DOM focus state). Pointer and wheel E2E specs follow the same shape.
- `korri/deploy/portal/main.tsx` and `korri/deploy/storybook/preview.tsx` — both call `startSpatialNavigation()`. No source changes needed; the new adapters are wired inside `start.ts` so both surfaces inherit them.

### Institutional Learnings

- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — the architectural contract this plan extends. The "implementation gotchas" section calls out HMR re-evaluation (already handled by `dispose()`), `preventDefault` discipline for editable elements, and the `:focus-visible` rationale that this plan deliberately replaces with `[data-input-mode]`-aware styling.

### External References

Skipped. Local patterns are well-established: there are existing reference adapters and an E2E pattern; no third-party docs are needed for `mousemove`/`wheel` event handling.

## Key Technical Decisions

- **Input mode is exposed as `[data-input-mode]` on `<html>`, not `<body>`.** Rationale: matches the existing dark-mode pattern (`<html class="dark">` set in `preview.tsx`) and lets `cursor: none` on the root cover the entire page including any backgrounds outside `<body>`.
- **`InputAction` gains an optional `source` field.** Values: `"keyboard"` | `"gamepad"` | `"pointer"` | `"wheel"`. Additive and non-breaking. The input-mode store subscribes to the bus and applies a single rule based on `source`. Without this discriminator the store would need timing heuristics ("pointer-activity within last N ms") to suppress mode flips when the wheel emits a `direction` while the user is in pointer mode. *(Resolves self-review finding #1: wheel-emitted directions must not switch to directional mode.)*
- **A new internal `InputAction` type, `pointer-activity`, signals raw mousemove without focus change.** The pointer adapter emits this on every qualifying `mousemove`, in addition to (sometimes) calling `.focus()`. This is the only path that can flip pointer mode when the user is typing in a search box (active element is editable, hover does not steal focus, but the cursor must still appear). Components do not subscribe to `pointer-activity`; it is reserved for the input-mode store. Documented as such in `types.ts`.
- **Hover targets the deepest focusable under the pointer via `event.target.closest(<focusable selector>)`.** Avoids focus thrash when a focusable button is nested inside a focusable card. *(Resolves self-review finding #2.)*
- **Hover focus is driven by `mousemove`, with `event.target.closest(...)` to find the focusable.** Not `mouseover`/`mouseenter`, which fire on element transitions caused by scroll without cursor motion. `mousemove` does not natively tell you which element is "under" the cursor — `event.target` is the element the cursor currently occupies on this event, and `closest()` walks up from there. *(Resolves self-review finding #5.)*
- **Right-click maps to `options` only on focusable targets, not on empty space.** Implementation: `contextmenu` listener checks `event.target.closest(<focusable selector>)`; if matched, emit `options` (with `source: "pointer"`) and `preventDefault` the native menu; otherwise the native context menu fires normally. *(Resolves origin deferred question on R12.)*
- **Unified active-tile rule stays globally scoped.** The replacement rule `[data-input-mode] :focus { ... }` mirrors the current global `:focus-visible` rule in `shift.css` — there is no `lrud-container` class actually in use today, so adding a `:focus-within(.lrud-container)` constraint would narrow scope below today's behavior. Per-component overrides in `korri/shared/design-system/explorations/home-screens/*.tsx` already use `:focus { outline: none }` to suppress the ring on certain surfaces; those continue to work. *(Resolves origin deferred question on R17.)*
- **Cursor visibility is controlled by `[data-input-mode="directional"] { cursor: none }`.** Single declarative CSS rule; no JS cursor manipulation. Does not interfere with iframes, plugins, or browser chrome.
- **Mousemove threshold of 1 px for mode flips, accumulated wheel-delta threshold of 80 (one classic mouse-wheel "click").** These are starting values; tuning is deferred to implementation if real devices reveal jitter or skipping.
- **The input-mode store is wired in `start.ts`, not imported by adapters directly.** Adapters stay pure: they emit tagged actions to the bus. `start.ts` registers a single bus listener that maps `source` to mode. This keeps adapter contracts unchanged from today's keyboard/gamepad shape, makes adapter unit tests independent of the store, and means there is exactly one place to read or change the mode-dispatch policy.

## Open Questions

### Resolved During Planning

- *Where does the input-mode store live?* Resolved: `korri/shared/navigation/input-mode.ts`. It writes a DOM attribute and is consumed by CSS — that is a navigation/UI concern, not a device-input concern.
- *Should pointer mode flip on `mousemove` even when active element is editable?* Resolved: yes. Mode flip is independent of focus theft. The cursor must reappear when the user wiggles the mouse during text input, even though the search box keeps focus.
- *Should `confirm` (Enter / left-click) flip the mode?* Resolved: no, per origin R4. The store rule reads `type === "direction"` before applying directional mode; pointer activity is the only path to pointer mode.
- *Do all `mousemove` events flip pointer mode, or only those where `closest(focusable)` returns non-null?* Resolved: all qualifying `mousemove` events (touch filter applied; sub-threshold motion ignored). Mode flip is independent of whether a focusable is under the cursor — the cursor's visibility is a function of input intent, not target.
- *Sequence number conflict?* Resolved: this is the first plan dated 2026-05-01, sequence `001`.

### Deferred to Implementation

- Exact `mousemove` pixel threshold and wheel delta-accumulation threshold may need tuning once real trackpad devices and TV-class hardware are exercised. Starting values: 1 px for mousemove, 80 accumulated `deltaY` per emitted `direction`. Adjust if jitter or skipping is observed.
- Whether the wheel adapter should reset its accumulator on direction-axis change or container exit. Probably yes, but the exact heuristic (timeout? boundary detection?) is best decided once the home tilegrid is exercised in storybook.
- Whether `data-pointer-wheel="2d"` on the home `TilegridScrollRoot` is added via a new `wheelDirection` prop on the Root or by spreading the attribute through the Root's existing pass-through props. Either is acceptable; the Root component owner decides at implementation time.
- Whether the existing `Tilegrid.story.e2e.ts` and `Tilegrid.gamepad.story.e2e.ts` should be expanded with pointer/wheel cases, or whether new sibling spec files (`Tilegrid.pointer.story.e2e.ts`, `Tilegrid.wheel.story.e2e.ts`) are clearer. Lean toward separate sibling files for parallel-reading clarity, but final decision belongs to the implementer.
- Whether `input-mode.ts` exposes a React hook (`useInputMode()`) for components that want to branch on mode. Defer until a consumer asks for it; the store itself is the durable surface.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Data flow

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ keyboard-adapter │    │  gamepad-adapter │    │  pointer-adapter │    │   wheel-adapter  │
│ source:"keyboard"│    │ source:"gamepad" │    │ source:"pointer" │    │  source:"wheel"  │
└────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
         │                       │                       │                       │
         │ direction/confirm/    │ direction/confirm/    │ pointer-activity      │ direction
         │ back/options/menu     │ back/options/menu     │ options(rclick)       │
         │                       │                       │ +.focus() on hover    │ +preventDefault
         │                       │                       │   (deepest focusable, │   (inside opted-in
         │                       │                       │    skip if editable)  │    container)
         │                       │                       │                       │
         └───────────┬───────────┴───────────┬───────────┴───────────┬───────────┘
                     │                       │                       │
                     ▼                       ▼                       ▼
              ┌──────────────────────────────────────────────────────────┐
              │                       InputBus                            │
              └─────────────────────────┬────────────────────────────────┘
                                        │
                       ┌────────────────┴────────────────┐
                       ▼                                 ▼
            ┌──────────────────────┐         ┌────────────────────────┐
            │   focus-engine       │         │   input-mode store     │
            │   (direction/confirm)│         │   subscribes to bus    │
            │   → element.focus()  │         │   source=pointer|wheel │
            │   → element.click()  │         │     → setPointerMode   │
            └──────────────────────┘         │   source=keyboard|     │
                                             │   gamepad +            │
                                             │   type=direction       │
                                             │     → setDirectional   │
                                             └───────────┬────────────┘
                                                         │
                                                         ▼
                                             html[data-input-mode="…"]
                                             + CSS: cursor:none in
                                               directional mode
```

### Mode-dispatch decision matrix

| Bus action | `type` | `source` | Resulting mode |
|---|---|---|---|
| Hover / cursor jiggle | `pointer-activity` | `pointer` | `pointer` |
| Wheel inside opted-in grid | `direction` | `wheel` | `pointer` |
| Right-click on focusable | `options` | `pointer` | `pointer` (no flip) |
| Arrow key | `direction` | `keyboard` | `directional` |
| D-pad / stick | `direction` | `gamepad` | `directional` |
| Enter / Space | `confirm` | `keyboard` | (no change) |
| Escape / Backspace | `back` | `keyboard` | (no change) |
| Gamepad B / Y / Start | `back` / `options` / `menu` | `gamepad` | (no change) |
| Untagged emit (synthetic / tests) | any | `undefined` | (no change) |

The "no change" rows are why mode flips are gated on both `source` and `type`.

## Implementation Units

- [ ] **Unit 1: Add `source` discriminator and `pointer-activity` action type**

**Goal:** Make every `InputAction` traceable to its emitting adapter, and add the internal action type the input-mode store will subscribe to. Tag existing adapters' emissions accordingly.

**Requirements:** R1, R2, R3, R5

**Dependencies:** None.

**Files:**
- Modify: `korri/shared/input/types.ts`
- Modify: `korri/shared/input/keyboard-adapter.ts`
- Modify: `korri/shared/input/gamepad-adapter.ts`
- Modify: `korri/shared/input/keyboard-adapter.test.ts`
- Modify: `korri/shared/input/gamepad-adapter.test.ts`
- Modify: `korri/shared/input/bus.test.ts` (only if existing assertions inspect action shape)

**Approach:**
- Add an optional `source?: "keyboard" | "gamepad" | "pointer" | "wheel"` field to every variant of the `InputAction` union. Document it as the dispatch discriminator for the input-mode store.
- Add a new variant `{ readonly type: "pointer-activity"; readonly source: "pointer" }` to the union. Comment in `types.ts` notes this is reserved for the input-mode store and should not be subscribed to from product code.
- Update `keyboard-adapter` to set `source: "keyboard"` on every emission. Update `gamepad-adapter` similarly with `source: "gamepad"`.
- Existing tests must keep passing with action shapes that now include `source`.

**Patterns to follow:**
- Existing union shape in `korri/shared/input/types.ts` — add fields, do not restructure variants.
- Existing emit pattern in `keyboard-adapter.ts` (`emit({ type: "direction", direction })`) — add the source field inline.

**Test scenarios:**
- *Happy path:* `keyboard-adapter` emits `{ type: "direction", direction: "up", source: "keyboard" }` for ArrowUp. Existing assertion updated to match new shape.
- *Happy path:* `gamepad-adapter` emits `{ type: "direction", direction: "right", source: "gamepad" }` for d-pad right. Existing assertion updated.
- *Happy path:* `keyboard-adapter` emits `{ type: "confirm", source: "keyboard" }` for Enter and Space. Existing test for Enter/Space updated.
- *Edge case:* A test action emitted directly via `bus.emit({ type: "direction", direction: "up" })` (no source) is still accepted by the type system and passes through the bus untouched.

**Verification:**
- `just test-unit` passes.
- `just typecheck` passes — the `source` field is optional on synthetic emits but populated on every adapter-emitted action.

---

- [ ] **Unit 2: Input-mode store**

**Goal:** Single source of truth for the `pointer` / `directional` mode. Writes `[data-input-mode]` on `<html>` and exposes subscribe / getMode for any future React consumer. Pure module — does not subscribe to the bus itself; that wiring lives in `start.ts`.

**Requirements:** R1, R3, R5

**Dependencies:** None.

**Files:**
- Create: `korri/shared/navigation/input-mode.ts`
- Create: `korri/shared/navigation/input-mode.test.ts`

**Approach:**
- Module exports `createInputModeStore(): InputModeStore` and a `subscribe`-style external store. The store owns a single mutable mode state (`"pointer"` initial default) and a Set of listeners.
- On every successful mode transition (mode actually changed), the store writes `document.documentElement.dataset.inputMode = mode` (or removes it for the default state — either is fine, plan resolves to "always set" for explicitness).
- The initial mode is `"pointer"` — desktop default. The first directional input flips it instantly.
- Provide `setPointerMode()` / `setDirectionalMode()` setters that the bus listener (wired in Unit 5) calls.
- Provide a `dispose()` that clears listeners and removes the DOM attribute, mirroring the dispose pattern in `bus.ts` and `focus-engine.ts`.
- Module is environment-tolerant: if `document` is undefined (SSR / non-browser test), store still works in memory but skips the DOM write.

**Patterns to follow:**
- `korri/shared/navigation/start.ts` — the singleton + `subscribe` + `getSnapshot` pattern (`getSpatialNavigationSnapshot` / `subscribeSpatialNavigation`). Mirror that shape so future React consumers can plug into `useSyncExternalStore` without a new pattern.
- `korri/shared/input/bus.ts` — the dispose-set pattern.

**Test scenarios:**
- *Happy path:* `setDirectionalMode()` flips mode and sets `document.documentElement.dataset.inputMode = "directional"`.
- *Happy path:* `setPointerMode()` flips mode back and sets the attribute to `"pointer"`.
- *Happy path:* Subscribers receive the new mode on every transition.
- *Edge case:* Setting the same mode twice in a row only notifies subscribers once (idempotent transition).
- *Edge case:* `dispose()` clears the subscriber set and removes the attribute.
- *Edge case:* Module imports cleanly in an environment without `document` (Bun unit-test default may have a DOM via happy-dom; if not, importing must not throw — guard with `typeof document !== "undefined"`).

**Verification:**
- `just test-unit` passes.
- New tests cover all transitions and the no-DOM edge case.

---

- [ ] **Unit 3: Pointer adapter**

**Goal:** Translate `mousemove`, `mousedown` (left button), and `contextmenu` events into the input bus. Drive hover focus. Filter out touch-derived pointer events. Skip focus theft when an editable element is focused. Emit `pointer-activity` on every qualifying movement so the input-mode store can flip to pointer mode.

**Requirements:** R6, R7, R8, R9, R10, R11, R12

**Dependencies:** Unit 1 (`source` field, `pointer-activity` action type).

**Files:**
- Create: `korri/shared/input/pointer-adapter.ts`
- Create: `korri/shared/input/pointer-adapter.test.ts`

**Approach:**
- `createPointerAdapter(options?)` returns an `InputAdapter` with `name: "pointer"`.
- Listens at `window` for `pointermove`, `pointerdown`, and `contextmenu`. Use `PointerEvent` (not `MouseEvent`) so `pointerType` is reliably available; fall back behavior if `PointerEvent` is unavailable is "do nothing" (no SSR throw, no synthetic event simulation).
- Touch filter: ignore any event where `event.pointerType === "touch"` or `event.pointerType === "pen"` (the latter is debatable but follows the principle of "only hands-on-mouse drives pointer mode"; if rejected, plan resolves to pen-as-pointer).
- Movement threshold: only emit `pointer-activity` (and run hover-focus logic) when the cumulative delta from the last emit exceeds `options.movementThresholdPx ?? 1`. Reset the accumulator on every emit. This stops sub-pixel cursor jitter from re-flipping mode unnecessarily.
- Hover focus logic on every qualifying `pointermove`:
  1. Emit `{ type: "pointer-activity", source: "pointer" }` unconditionally (mode store consumes this).
  2. If `document.activeElement` is editable (`<input>`, `<textarea>`, `[contenteditable]`), skip focus logic. Use the existing `isEditableElement` helper or inline equivalent from `keyboard-adapter.ts`.
  3. Resolve target focusable: `event.target.closest(FOCUSABLE_SELECTOR)` where `FOCUSABLE_SELECTOR` matches the engine's default initial-focus selector (`a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])`).
  4. If a focusable matched and is not the active element, call `.focus({ preventScroll: true })` on it. `preventScroll` keeps the page from auto-scrolling on mouse-induced focus changes.
  5. If no focusable matched (cursor over gap / background), do nothing — the previously focused tile remains active per R10.
- `contextmenu` handler: walk `event.target.closest(FOCUSABLE_SELECTOR)`; if matched, `event.preventDefault()` and emit `{ type: "options", source: "pointer" }`. Otherwise, return without preventDefault so the native context menu fires.
- `pointerdown` handler: nothing for left-button (native click already handles it). Right-button is covered by `contextmenu`.
- `start(emit)` returns a disposer that removes all listeners.

**Execution note:** Test-first. Write the editable-element protection and the deepest-focusable resolution as failing tests before wiring the listeners.

**Patterns to follow:**
- `korri/shared/input/keyboard-adapter.ts` — `start(emit)` shape, `defaultPrevented`-aware handler, `isEditableElement` helper, dispose pattern.
- `korri/shared/input/gamepad-adapter.ts` — adapter naming and option-object shape.

**Test scenarios:**
- *Happy path:* `pointermove` over a `<button>` calls `.focus()` on that button. Adapter emits `{ type: "pointer-activity", source: "pointer" }`.
- *Happy path:* `pointermove` over a nested structure (`<div><button>…</button></div>`) where the cursor's target is the inner button focuses the button (deepest-focusable resolution).
- *Happy path:* `pointermove` over a card containing a button focuses the *button*, not the card, when both match the focusable selector and the button is the deeper match.
- *Edge case:* `pointermove` with `pointerType === "touch"` is fully ignored (no emission, no focus change).
- *Edge case:* `pointermove` with cumulative delta below the movement threshold does not re-emit `pointer-activity` or re-focus.
- *Edge case:* `pointermove` over empty space (no focusable in `closest()`) emits `pointer-activity` but does not blur the active element.
- *Edge case:* `pointermove` while `document.activeElement` is `<input>` emits `pointer-activity` but does not call `.focus()` on the hovered tile.
- *Edge case:* `pointermove` over the same focusable that is already `document.activeElement` does not call `.focus()` redundantly.
- *Edge case:* `contextmenu` on a `<button>` emits `{ type: "options", source: "pointer" }` and `preventDefault()`s the event.
- *Edge case:* `contextmenu` on a non-focusable region (e.g., page background) does not emit `options` and does not call `preventDefault()` — native context menu remains.
- *Integration:* When wired through `bus.use(adapter)`, `pointer-activity` actions reach a generic `bus.on()` listener with the correct `source` tag.

**Verification:**
- `just test-unit` passes.
- All scenarios above are covered by named tests.

---

- [ ] **Unit 4: Wheel adapter**

**Goal:** Inside an opted-in container (`data-pointer-wheel` attribute), translate wheel events into `direction` `InputAction`s with `source: "wheel"`, with delta accumulation. Outside opted-in containers, do nothing — native scroll is preserved.

**Requirements:** R13, R14, R15, R16

**Dependencies:** Unit 1 (`source` field).

**Files:**
- Create: `korri/shared/input/wheel-adapter.ts`
- Create: `korri/shared/input/wheel-adapter.test.ts`

**Approach:**
- `createWheelAdapter(options?)` returns an `InputAdapter` with `name: "wheel"`.
- Listens at `window` for `wheel` events. Use `{ passive: false }` because the adapter calls `preventDefault()` inside opted-in containers.
- For each wheel event:
  1. Find the nearest ancestor of `event.target` matching `[data-pointer-wheel]`. If none, return — native scroll proceeds.
  2. Read the attribute value: `"vertical"`, `"horizontal"`, or `"2d"`. Treat any other value (or empty) as `"2d"` and warn once in dev (warning emission is a deferred polish, not required for v1).
  3. Accumulate `event.deltaY` and `event.deltaX` into a per-container-axis running sum (or two running sums for `"2d"`). Reset the cross-axis accumulator if the dominant axis changed.
  4. While the accumulated absolute delta on the active axis ≥ `options.deltaThreshold ?? 80`, subtract the threshold and emit one `direction` action:
     - `"vertical"`: positive deltaY → `"down"`, negative → `"up"`. Ignore deltaX.
     - `"horizontal"`: positive deltaY OR positive deltaX → `"right"`, negative → `"left"`. (Vertical wheel on a horizontal rail is the explicit user-confirmed mapping.)
     - `"2d"`: deltaY axis → up/down, deltaX axis → left/right; whichever axis is dominant in this event drives this tick's direction.
  5. Emit `{ type: "direction", direction, source: "wheel" }` for each threshold cross.
  6. `event.preventDefault()` on every event consumed inside an opted-in container, regardless of whether a threshold was crossed (so trackpad partial-deltas don't scroll the page underneath).
- `start(emit)` returns a disposer that removes the listener.
- Adapter does NOT update the input-mode store directly; the store will see `source: "wheel"` on the bus and treat it as pointer activity (per Unit 5).

**Execution note:** Test-first. The accumulator + threshold logic is the part most likely to surprise; pin it with tests before wiring the DOM.

**Patterns to follow:**
- `korri/shared/input/keyboard-adapter.ts` — adapter shape and option object.
- The accumulator pattern resembles the gamepad adapter's auto-repeat hold-state, but driven by event-loop accumulation rather than rAF polling.

**Test scenarios:**
- *Happy path:* A wheel event with `deltaY: 100` on an element inside `<div data-pointer-wheel="vertical">` emits one `{ type: "direction", direction: "down", source: "wheel" }` and calls `preventDefault()`.
- *Happy path:* A wheel event with `deltaY: 80` (exactly threshold) emits exactly one direction and resets the accumulator.
- *Happy path:* A wheel event with `deltaY: -80` inside `data-pointer-wheel="vertical"` emits `direction: "up"`.
- *Happy path:* On `data-pointer-wheel="horizontal"`, a wheel event with `deltaY: 80` (vertical wheel motion on a horizontal rail) emits `direction: "right"`.
- *Happy path:* On `data-pointer-wheel="2d"`, a wheel event with `deltaY: 80, deltaX: 0` emits `direction: "down"`. A second event with `deltaX: 80, deltaY: 0` emits `direction: "right"`.
- *Edge case:* Two consecutive wheel events with `deltaY: 50` each accumulate to 100 and emit exactly one `direction: "down"` (with 20 px residual carried into the accumulator).
- *Edge case:* A single wheel event with `deltaY: 240` emits three `direction: "down"` actions in one event (240 / 80 = 3).
- *Edge case:* A wheel event on an element with NO `data-pointer-wheel` ancestor does NOT call `preventDefault()` and does NOT emit anything.
- *Edge case:* A wheel event on an element with `data-pointer-wheel` set to an unknown value (`"foo"`) is treated as `"2d"`. (Could also be treated as `"none"` — implementation chooses; default to `"2d"` per "fail open to a working mapping".)
- *Edge case:* A `data-pointer-wheel="vertical"` container ignores deltaX entirely. A horizontal trackpad swipe inside such a container does not emit and does not preventDefault — native horizontal scroll on the parent (if any) proceeds.
- *Edge case:* Disposing the adapter removes the listener — subsequent wheel events do not emit.
- *Integration:* When wired through `bus.use(adapter)`, the emitted `direction` actions with `source: "wheel"` are correctly delivered to a `bus.on()` listener.

**Verification:**
- `just test-unit` passes.
- All threshold and axis-mapping branches above are exercised.

---

- [ ] **Unit 5: Wire adapters and input-mode listener in `start.ts`**

**Goal:** Make the new adapters part of the default spatial-navigation handle, and subscribe the input-mode store to the bus so mode flips happen at the right times. Preserve current `start.ts` API ergonomics (single-call wiring, optional adapter disable flags).

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** Units 1, 2, 3, 4.

**Files:**
- Modify: `korri/shared/navigation/start.ts`
- Modify: `korri/shared/navigation/start.test.ts`

**Approach:**
- Extend `StartSpatialNavigationOptions` with two additive fields:
  - `pointer?: false | Parameters<typeof createPointerAdapter>[0]`
  - `wheel?: false | Parameters<typeof createWheelAdapter>[0]`
- After creating the bus and engine, before returning the handle:
  1. Construct the input-mode store via `createInputModeStore()`.
  2. Subscribe a single bus listener that applies the dispatch matrix from "High-Level Technical Design":
     - `source === "pointer" || source === "wheel"` → `store.setPointerMode()`
     - `source === "keyboard" || source === "gamepad"` AND `type === "direction"` → `store.setDirectionalMode()`
     - All other action shapes (untagged synthetic emits, confirm/back/options/menu from keyboard/gamepad) → no mode change.
  3. Wire `createPointerAdapter()` via `bus.use()` unless `options.pointer === false`.
  4. Wire `createWheelAdapter()` via `bus.use()` unless `options.wheel === false`.
- The `dispose()` returned on the handle additionally calls `store.dispose()`.
- The existing tests in `start.test.ts` use `keyboard: false, gamepad: false`. Add equivalent flags for the new adapters in tests that don't want them, and preserve the ability to disable any subset of adapters.

**Patterns to follow:**
- Existing `start.ts` wiring of keyboard and gamepad adapters — same shape, same disable-flag convention.

**Test scenarios:**
- *Happy path:* Calling `startSpatialNavigation({ keyboard: false, gamepad: false, pointer: false, wheel: false, nextFocus: () => null })` returns a handle whose bus has no adapters — for unit tests that only want to drive the bus by hand.
- *Happy path:* `bus.emit({ type: "direction", direction: "up", source: "keyboard" })` flips `document.documentElement.dataset.inputMode` to `"directional"`.
- *Happy path:* `bus.emit({ type: "pointer-activity", source: "pointer" })` flips `document.documentElement.dataset.inputMode` to `"pointer"`.
- *Happy path:* `bus.emit({ type: "direction", direction: "down", source: "wheel" })` flips mode to `"pointer"` (wheel is pointer-driven).
- *Edge case:* `bus.emit({ type: "confirm", source: "keyboard" })` does NOT change the input mode (confirm is not a direction; keyboard confirm should not hide the cursor).
- *Edge case:* `bus.emit({ type: "options", source: "pointer" })` does NOT flip mode (already pointer; right-click during pointer mode is a no-op for mode).
- *Edge case:* An untagged synthetic `bus.emit({ type: "direction", direction: "up" })` (no source) does NOT change mode. Existing tests that use this shape continue passing.
- *Edge case:* Disposing the handle disposes the input-mode store and removes the `[data-input-mode]` attribute.
- *Edge case:* `startSpatialNavigation()` called twice in a row (HMR scenario) disposes the prior store before creating the new one — no duplicated DOM mutations or stranded listeners.
- *Integration:* With pointer and wheel adapters enabled by default, a Bun-environment `pointermove` event simulation reaches the focus engine through the real bus and updates `document.activeElement`.

**Verification:**
- `just test-unit` passes.
- New tests cover the dispatch matrix completely.

---

- [ ] **Unit 6: Replace `:focus-visible` rule with `[data-input-mode]`-aware unified focus + cursor styling**

**Goal:** Make the same active-tile look fire for pointer-induced focus that already fires for keyboard/gamepad-induced focus. Hide the OS cursor when the user is in directional mode.

**Requirements:** R17, R18

**Dependencies:** Units 2 + 5 (the `[data-input-mode]` attribute must actually be set at runtime for the CSS to do anything).

**Files:**
- Modify: `korri/shared/themes/shift/shift.css`

**Approach:**
- In the `@layer base` block, replace the `:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; border-radius: 4px; }` rule with a `:focus { ... }` rule using the same outline values. The rule fires for both pointer-induced focus and keyboard-induced focus because we are no longer keying on the browser's `:focus-visible` heuristic.
- Add a cursor-hiding rule: `[data-input-mode="directional"], [data-input-mode="directional"] * { cursor: none; }` in `@layer base`. The descendant-and-self selector form is required because per-element `cursor: pointer` declarations (e.g., on `<button>` or in `.shift-card`) have their own specificity and would otherwise win over a `cursor: none` set only on `<html>`. The descendant selector raises specificity to `(0,1,1)` which beats single-element selectors like `button { cursor: pointer }` at `(0,0,1)` and ties with class selectors at `(0,1,0)`, where source order wins (this rule lives in `@layer base`, which is below `@layer components` in cascade order — so we either elevate to `!important` or place it at the deepest layer that needs to win, which planning resolves to: use the `[data-input-mode="directional"] *` form *and* place it in `@layer utilities` to win against component-layer cursor declarations). Implementer chooses between `!important` and a higher layer based on Tailwind v4's actual cascade behavior in this project — both are documented and acceptable.
- Inside the `@layer components` block, the existing `.shift-card:focus-visible` rule is rewritten to `.shift-card:focus`. Same colors and offsets; same effect; just no longer gated on `:focus-visible`.
- Per-component overrides in `korri/shared/design-system/explorations/home-screens/*.tsx` (which set `[data-exploration="…"] :focus { outline: none }` already) keep working unchanged. Their `:focus-visible { outline: none }` companion rules become redundant but harmless — leave them in place to avoid touching files outside this plan's scope.
- No changes to `:focus-visible`-based styling on `korri/shared/design-system/components/ui/button.tsx` (shadcn-style component-level focus rings). Those are intentionally mouse-suppressing form-control rings and remain `:focus-visible`-gated. R18 explicitly preserves this.

**Patterns to follow:**
- Existing `@layer base` and `@layer components` structure in `shift.css`.

**Test scenarios:**
- *Test expectation: visual.* This unit changes CSS only. Behavior is verified end-to-end in Unit 7. No additional unit-test scenarios for this unit.
- (Optional) Document a manual visual check in the verification: load the home page, hover a tile, confirm the same outline fires; press an arrow key, confirm cursor disappears.

**Verification:**
- `just typecheck` passes.
- `just lint` passes (Biome should not complain about the CSS file; it is linted via Biome's CSS rules if any).
- Visual inspection in Storybook confirms hover lights up tiles identically to keyboard navigation, and arrow-key input hides the cursor.

---

- [ ] **Unit 7: Opt the home tilegrid into wheel-as-direction; story-driven Playwright coverage**

**Goal:** Prove the end-to-end behavior on a real consumer. Add `data-pointer-wheel` to the home tilegrid container and write Playwright story specs that exercise pointer hover, last-input-wins, and wheel-as-direction.

**Requirements:** R7, R8, R10, R13, R14, R15, R16, R17

**Dependencies:** Units 3, 4, 5, 6.

**Files:**
- Modify: `korri/shared/design-system/components/Tilegrid/TilegridScrollRoot.tsx` (or the root component that owns the outer container element — implementer confirms which file actually renders the outer DOM element).
- Create: `korri/shared/design-system/components/Tilegrid/Tilegrid.pointer.story.e2e.ts`
- Create: `korri/shared/design-system/components/Tilegrid/Tilegrid.wheel.story.e2e.ts`
- Modify: `korri/products/app/routes/+index.tsx` if the route consumer needs to pass a `wheelDirection` prop (only if the Root does not opt in by default).

**Approach:**
- Make the home `TilegridScrollRoot` declare `data-pointer-wheel="2d"` on its outer container. Either:
  - The Root renders the attribute by default for scroll mode (cleanest — scroll-mode tilegrids are 2D grids; the rail mode would override to `"horizontal"`), or
  - The Root accepts a prop (e.g., `wheelDirection?: "vertical" | "horizontal" | "2d" | "none"`) and the consumer at `korri/products/app/routes/+index.tsx` passes `"2d"`.
- Pointer story spec follows `Tilegrid.gamepad.story.e2e.ts` shape:
  1. Navigate to the existing Tilegrid playground story.
  2. Use Playwright's `page.mouse.move()` to hover over the second tile. Assert that tile has `:focus` (or `aria-current` equivalent) and `document.documentElement.dataset.inputMode === "pointer"`.
  3. Press `ArrowRight`. Assert the third tile is focused, `inputMode === "directional"`, and the cursor is hidden (page CSS `cursor: none` reachable via computed style on `<html>`).
  4. Call `page.mouse.move()` again over the first tile. Assert focus snaps to that tile and `inputMode === "pointer"`.
  5. With focus on a tile, simulate typing in any visible search box if one exists in the playground story; confirm hover during typing does not steal focus.
- Wheel story spec:
  1. Navigate to the same playground story (which renders inside an opted-in container).
  2. Place the cursor inside the grid via `page.mouse.move()`.
  3. Use `page.mouse.wheel(0, 80)` to dispatch one classic-mouse-wheel "click" worth of vertical scroll. Assert the next tile (down) is focused and the page did NOT scroll (compare `window.scrollY` before/after).
  4. Repeat with `page.mouse.wheel(0, 240)` and assert focus moved three tiles.
  5. Move the cursor outside the grid container (over a non-opted-in region), call `page.mouse.wheel(0, 200)`, and assert the page scrolled normally and focus did NOT move.

**Patterns to follow:**
- `korri/shared/design-system/components/Tilegrid/Tilegrid.gamepad.story.e2e.ts` — file shape, story-id reference, viewport pinning, fake-driver init pattern (the wheel and pointer specs do not need fake drivers because Playwright drives real `page.mouse` events, but the spec layout matches).
- File-naming convention enforced by the suite: `*.story.e2e.ts` (the decoupled-spatial-navigation doc explicitly notes Bun would otherwise misclaim `*.spec.ts` files).

**Test scenarios:**
- (See approach above — each numbered step in the two specs is a scenario.)
- *Happy path (pointer):* hover focuses; arrow press from a hovered tile lands on the geometric neighbor.
- *Happy path (last-input-wins):* arrow press hides cursor; subsequent mousemove unhides cursor and re-focuses.
- *Happy path (wheel):* wheel inside grid moves focus and prevents page scroll.
- *Happy path (wheel scope):* wheel outside opted-in container scrolls page natively, focus unchanged.
- *Edge case (typing):* hovering a tile while a search box has focus does not steal focus.
- *Edge case (wheel direction):* the `2d` mapping means deltaY moves up/down; deltaX (e.g., `page.mouse.wheel(80, 0)`) moves left/right.
- *Edge case (touch ignore):* not directly testable with Playwright `page.mouse.*`, but a Bun unit test in Unit 3 already covers this — no scenario needed here.

**Verification:**
- `just test-component` (or equivalent Playwright story-runner recipe) passes.
- Manually loading the home page in `just dev-web` confirms the same behaviors interactively.

## System-Wide Impact

- **Interaction graph:** New listeners attach at `window` (`pointermove`, `pointerdown`, `contextmenu`, `wheel`). All pass through the same `InputBus` already used by keyboard and gamepad adapters. The focus engine receives `direction` actions identically regardless of source.
- **Error propagation:** Adapters do not throw user-facing errors. SSR / non-browser environments are guarded (no `document` / `navigator` access in module scope).
- **State lifecycle risks:** Input-mode store side-effect (writing to `<html>`) must be reverted on dispose. HMR re-evaluation already triggers `dispose()` via `start.ts`'s `currentHandle?.dispose()` pattern; the store's own dispose removes the attribute so a subsequent `start()` writes a clean initial state.
- **API surface parity:** The `InputAction.source` field is additive. Existing consumers that pattern-match on `action.type` continue to work. The new `pointer-activity` action type is internal; adding it to the union is a non-breaking superset.
- **Integration coverage:** Storybook + Playwright story specs (Unit 7) prove the layered behavior end-to-end. Unit tests cover each adapter in isolation. The dispatch-matrix in `start.ts` is unit-tested by emitting tagged actions onto the bus and asserting the DOM attribute.
- **Unchanged invariants:**
  - The `InputAdapter` interface is unchanged. New adapters slot in like keyboard and gamepad.
  - `focus-engine.ts` is unchanged. Direction actions from the wheel adapter reach LRUD's `getNextFocus` exactly the same way as direction actions from the keyboard adapter.
  - `useInputAction()` is unchanged. Components consuming `back` / `menu` / `options` continue to work (and now receive `options` from right-click as a bonus).
  - The `:focus-visible`-keyed styling on shadcn's `button.tsx` form-control component is preserved — those are intentionally mouse-suppressing focus rings on form fields, not spatial-nav tile rings.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `pointermove` firing rate could overwhelm the bus on continuous mouse motion. | Movement-threshold gate (Unit 3, default 1 px) and idempotent mode-flip (Unit 2 — same-mode setter is a no-op) keep the per-frame work small. If profiling shows a hot spot, raise threshold or rAF-throttle in implementation. |
| Trackpad sub-pixel `deltaY` streams could skip many tiles per gesture if the threshold is too low. | Unit 4 sets a starting threshold of 80 (one classic mouse-wheel click). Tunable. Tests pin the math so retuning is a one-line change. |
| Existing exploration stories already override `:focus`/`:focus-visible` on certain surfaces; behavior must remain visually identical there. | The unified rule is added at the same `@layer base` level as today's `:focus-visible` rule, so per-exploration `[data-exploration="…"] :focus { outline: none }` overrides continue to win on specificity. Unit 6's manual visual check verifies. |
| Right-click `options` may surprise users who expect a native context menu on tile UIs. | Behavior is scoped to focusables only — empty space and non-tile surfaces still get the native menu. Easy to revert by removing the `contextmenu` handler if user feedback rejects it. |
| `cursor: none` on `<html>` while a modal/popover is open could hide the cursor over the modal. | Acceptable: directional mode is supposed to hide the cursor everywhere on the page until the user mousemoves. Modals are still navigable via spatial nav and via keyboard `Escape` → `back`. Reconsider if a real modal flow surfaces the issue. |

## Documentation / Operational Notes

- After landing, update `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` to reference the pointer + wheel adapters and the `[data-input-mode]` attribute. The "implementation gotchas" list there is a good home for the threshold-tuning notes and the `:focus-visible` → `[data-input-mode]` migration rationale.
- Consider a follow-up institutional-learning note (`docs/solutions/best-practices/last-input-wins-cursor-mode-2026-MM-DD.md`) once the behavior has been exercised on real hardware, capturing any tuning that emerges.

## Sources & References

- **Origin document:** `docs/brainstorms/2026-05-01-pointer-aware-spatial-navigation-requirements.md`
- Architectural contract: `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`
- Existing adapters: `korri/shared/input/keyboard-adapter.ts`, `korri/shared/input/gamepad-adapter.ts`
- Bus + types: `korri/shared/input/bus.ts`, `korri/shared/input/types.ts`
- Focus engine + wiring: `korri/shared/navigation/focus-engine.ts`, `korri/shared/navigation/start.ts`
- E2E test pattern: `korri/shared/design-system/components/Tilegrid/Tilegrid.gamepad.story.e2e.ts`
- Theme entry point for the focus rule: `korri/shared/themes/shift/shift.css`
