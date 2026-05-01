---
date: 2026-05-01
topic: pointer-aware-spatial-navigation
---

# Pointer-Aware Spatial Navigation

## Problem Frame

Today the spatial-navigation system (documented in `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`) supports keyboard and gamepad. Mouse interaction works only because every focusable is a real `<button>` / `<a>` — clicks fire, but the mouse never participates in the spatial focus state:

- Hovering a tile does not "light it up" the way arrow-key navigation does.
- `:focus-visible` is the only focus-styling hook, and it deliberately does *not* fire on mouse-induced focus, so any visible "active tile" treatment is currently keyboard/gamepad only.
- There is no input-mode awareness, so on desktop the cursor is always visible even when the user is driving the UI with arrow keys, and on TV builds there is no path for a mouse to coexist with directional input.
- Scrolling the wheel inside a tilegrid does nothing useful — it scrolls the page or the grid as a scroll container, instead of cycling focus through tiles the way arrow keys do.

Korri ships to both desktop and TV-style targets, so all three input families (mouse, keyboard, gamepad) need to share one unified focus model where "the active tile" looks identical regardless of which input picked it.

## Requirements

**Input-mode model**

- R1. The system tracks a single global **input mode** with two values: `pointer` and `directional`. Mode is exposed to CSS as `[data-input-mode]` on a top-level element so styling rules can branch on it.
- R2. Real `mousemove` events switch the mode to `pointer` and reveal the OS cursor.
- R3. Any directional `InputAction` (`direction`, regardless of source — keyboard, gamepad, or wheel) switches the mode to `directional` and hides the OS cursor (`cursor: none` while the mode is active).
- R4. `confirm`, `back`, `options`, and `menu` actions do **not** force a mode switch. Confirming a hovered tile with the keyboard's Enter key, or right-clicking with the mouse, leaves the current mode alone.
- R5. Input mode is owned by a single source of truth alongside the existing input bus / focus engine layer; no component reads or writes it directly.

**Mouse adapter (pointer mode)**

- R6. A pointer adapter participates as a peer of `keyboard-adapter` and `gamepad-adapter`. It listens at the document level, not on individual components, consistent with the architectural rule that components stay native HTML.
- R7. While in pointer mode, hovering a focusable element calls `.focus()` on it, making `document.activeElement` the canonical "active tile" for both styling and the next directional press.
- R8. Hover focus is driven by real `mousemove`, not by `mouseover`/`mouseenter` alone. Trackpad/wheel scrolling that slides tiles under a stationary cursor does **not** move focus.
- R9. Hover never steals focus from editable elements (`<input>`, `<textarea>`, `[contenteditable]`). When such an element holds focus, pointer events still update the input mode and cursor visibility but skip the `.focus()` call on the hovered tile.
- R10. Hover over non-focusable space (gaps between tiles, page background, scroll gutters) does not blur the current focus. The most recently focused tile remains active until another focusable is hovered or a directional action moves focus.
- R11. Touch-derived pointer events are ignored. Filter on `PointerEvent.pointerType !== "touch"` so a tap on a touch device does not enter pointer mode and does not re-show a cursor that physically isn't there.
- R12. A right-click on a focusable inside the spatial scope emits the existing `options` semantic action and prevents the native context menu inside that scope. Outside the spatial scope (if any), the native context menu is preserved.

**Wheel-as-direction (opt-in)**

- R13. A wheel adapter emits the same `direction` `InputAction` that keyboard and gamepad emit, so the focus engine handles it uniformly.
- R14. Wheel-as-direction is **opt-in per container** via a `data-pointer-wheel` attribute with values `"vertical"` (deltaY → up/down), `"horizontal"` (deltaY → left/right; deltaX → left/right), or `"2d"` (deltaY → up/down, deltaX → left/right).
- R15. Inside an opted-in container (cursor is over a descendant), the wheel event is consumed: native page scroll is `preventDefault`ed and one directional action is emitted. Outside opted-in containers, wheel events are not touched and native scroll behavior is preserved.
- R16. Wheel input accumulates deltas and emits one direction per "tick" so that trackpad streams (many small `deltaY` values per gesture) do not skip multiple tiles per swipe and traditional mouse wheel "clicks" feel responsive.

**Visual treatment**

- R17. Pointer-driven and directional-driven focus produce the same active-tile treatment (ring, lift/scale, preview behavior). There is no separate "soft hover" style. The unified rule is keyed off `[data-input-mode]` plus `:focus`, not `:focus-visible`.
- R18. Existing `:focus-visible`-based styling for non-tile interactives (e.g., header buttons, form controls) is preserved where it already exists; this brainstorm changes the rule for spatial-nav focusables, not for every interactive in the app.

## Visual: Mode Transitions

```
                   mousemove (pointerType != touch)
                ┌────────────────────────────────────┐
                │                                    ▼
        ┌──────────────────┐               ┌──────────────────┐
        │   directional    │               │     pointer      │
        │ cursor hidden    │               │ cursor visible   │
        │ wheel→direction  │               │ hover→focus()    │
        └──────────────────┘               └──────────────────┘
                ▲                                    │
                └────────────────────────────────────┘
                  any direction action
                  (keyboard / gamepad / wheel)
```

Click, Enter, right-click (`options`), Escape (`back`), and `menu` actions do not transition the mode.

## Success Criteria

- Hovering a tile with the mouse produces the same visible "active" treatment as arrow-keying to it. A user cannot tell from the screenshot which input drove focus.
- Pressing an arrow key while the mouse is idle hides the cursor; the next `mousemove` brings the cursor back and focus snaps to whatever tile the cursor is currently over.
- Pressing arrow keys while text-editing in a search input still navigates within the input (existing keyboard adapter behavior). Hovering a tile while typing does not steal focus from the search box.
- Scrolling the wheel inside a tilegrid (a container with `data-pointer-wheel`) cycles focus tile-by-tile and does not scroll the page. Scrolling the wheel anywhere else scrolls the page natively.
- A horizontal "Recently Played" rail can be configured (`data-pointer-wheel="horizontal"`) so that vertical wheel motion moves focus left/right through the rail, matching desktop carousel convention.
- Storybook exhibits the same behavior as the running app: hover lights up tiles, arrow keys hide the cursor, wheel inside an opted-in grid steps through tiles.
- A Playwright story-driven spec asserts: (a) hover focuses a tile, (b) arrow press after hover continues from the hovered tile, (c) `mousemove` after arrow press unhides cursor and re-focuses under cursor, (d) wheel inside a `data-pointer-wheel` container moves focus by one tile per tick.
- No component file under `korri/products/*` or `korri/shared/themes/*` imports anything new from `@shared/input/*` or `@shared/navigation/*` to get this behavior. Pointer awareness is added entirely at the navigation/input layer plus theme CSS.

## Scope Boundaries

- No new component-level APIs. Components stay native HTML. The only new surface a component author can touch is the `data-pointer-wheel` attribute on a grid container — same shape as the existing LRUD attribute hints (`lrud-container`, `data-block-exit`, `data-lrud-overlap-threshold`).
- No drag-to-select, marquee selection, or pointer-based reordering. Pointer is only being given parity with directional focus; richer pointer gestures are a separate feature.
- No touch-specific behavior beyond ignoring touch-derived pointer events. A real touch-input adapter (swipe → direction, long-press → options) is a future adapter behind the same `InputAdapter` interface.
- No change to gamepad or keyboard adapters' existing semantics. The wheel adapter is additive; it does not rewrite the keyboard handler.
- No focus ring redesign. The active-tile visual is whatever the theme already paints for directional focus; this work makes pointer focus reach the same state, not invent a new look.
- No environment-determined mode (desktop = always pointer, TV = always directional). Mode is dynamic per input event in every build, per the chosen last-input-wins model.
- No persistence of input mode across page loads or reloads. Each session starts in a sensible default (likely `pointer` on desktop, but the first directional input flips it instantly).

## Key Decisions

- **Last-input-wins is the cursor model.** Cursor is shown when the pointer is in use and hidden the moment a directional input fires. Rationale: matches the Plex / Steam Big Picture / Apple TV pattern the user named, and resolves all three of "tactical fix, cross-device parity, last-input-wins UX" in one model.
- **Hover moves real DOM focus, not a parallel visual-only state.** Rationale: keeps `document.activeElement` as the single source of truth, so the next directional press starts from the hovered tile without any reconciliation logic. Reuses the existing focus engine unchanged.
- **Identical visual treatment for pointer and directional focus.** Rationale: the user's stated goal is "hovering marks it as active" — i.e., the same active state, not a parallel hover state. Avoids CSS branching and keeps the mental model "focus is focus."
- **Drive styling off `[data-input-mode]` plus `:focus`, not `:focus-visible`.** Rationale: `:focus-visible` is browser-defined to skip mouse-induced focus, which is exactly the wrong behavior for tile-style UIs where mouse focus must be visible. The `[data-input-mode]` attribute is the explicit replacement.
- **Wheel-as-direction is opt-in via attribute, not implicit on every LRUD container.** Rationale: a horizontal rail and a 2D grid require different deltaY mappings, and there is no reliable way to infer that from geometry. Opt-in matches the existing pattern of LRUD attribute hints and keeps the behavior easy to reason about.
- **Right-click maps to `options`.** Rationale: gives mouse users parity with the gamepad's options button so per-tile menus work uniformly. Cheap to add and easy to revert.
- **Touch pointer events are ignored.** Rationale: synthetic mouse events on tap are inconsistent across browsers and would re-show a cursor that has no physical presence on a touch device. A future touch adapter handles touch on its own terms.

## Dependencies / Assumptions

- The architecture documented in `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` is the contract this work extends. New input devices are new `InputAdapter` implementations; the focus engine and bus stay unchanged. *Verified against `korri/shared/input/types.ts`, `korri/shared/input/bus.ts`, `korri/shared/navigation/start.ts`, and `korri/shared/navigation/focus-engine.ts`.*
- LRUD's `getNextFocus` reads the live DOM by bounding-rect geometry, so a hover-induced focus change leaves the next directional press computing the correct neighbor without any extra wiring. *Verified in `korri/shared/navigation/start.ts`.*
- The keyboard adapter already has `ignoreWhenEditable` semantics; the pointer adapter mirrors the same rule for hover-induced focus. *Verified in `korri/shared/input/keyboard-adapter.ts`.*
- The Storybook preview wires `startSpatialNavigation()` at module scope and is HMR-safe via `dispose()`. The pointer and wheel adapters must participate in the same dispose lifecycle to avoid duplicated listeners across hot reloads. *Verified in the gotchas section of the decoupled-spatial-navigation doc.*
- Theme CSS currently lives under `korri/shared/themes/*` and `korri/shared/design-system/*`. The unified `[data-input-mode]` + `:focus` rule lands somewhere in those directories; exact placement is a planning concern.
- `data-input-mode` placement on `<html>` vs `<body>` is an unverified assumption — both work; planning picks whichever matches existing theme/CSS conventions in the repo.

## Outstanding Questions

### Resolve Before Planning

(none)

### Deferred to Planning

- [Affects R8, R16][Technical] Exact `mousemove` and wheel-delta thresholds. Cursor jitter from touchpad palms and trackpad inertia could otherwise flap the input mode or emit phantom direction ticks. Likely a small pixel threshold for `mousemove` and an accumulated-delta threshold for wheel.
- [Affects R1, R3][Technical] Whether `data-input-mode` lives on `<html>` or `<body>`, and whether an alternative implementation (CSS class, CSS custom property) better matches the repo's existing theming approach.
- [Affects R12][Technical] Whether `options` from right-click should fire only when a focusable is the contextmenu target, or also when right-clicking empty space inside the spatial scope. The intuitive answer is "only on focusables," but the engine's `onOptions` handler currently passes the focused element regardless.
- [Affects R14, R15][Needs research] Whether `data-pointer-wheel` should accept additional values (e.g., `"snap"` for snap-scroll containers, or per-axis tuning) once a second consumer beyond the home tilegrid exists. Defer until the second use case appears.
- [Affects R17][Technical] Whether the `[data-input-mode="pointer"] :focus` rule should additionally require `:focus-within` on a containing `lrud-container` to avoid lighting up unrelated focusables (e.g., a hidden form input that happens to hold focus when the cursor enters a grid).
- [Affects R6, R13][Technical] Final filenames and shape under `korri/shared/input/` (likely `pointer-adapter.ts`, `wheel-adapter.ts`) and where the input-mode store lives (in the bus, alongside `start.ts`, or as a new tiny module).

## Next Steps

-> `/ce:plan` for structured implementation planning
