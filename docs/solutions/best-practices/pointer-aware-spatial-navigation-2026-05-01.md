---
title: Pointer-aware spatial navigation without breaking the device-agnostic architecture
date: 2026-05-01
category: best-practices
module: shared/input + shared/navigation + shared/themes
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Extending a decoupled, device-agnostic spatial-navigation stack to support mouse / pointer input
  - Building hybrid UIs that ship to both TV/console and desktop targets and need one unified focus model
  - Wiring a "last-input-wins" cursor model (Plex / Steam Big Picture / Apple TV) where the most recent input drives focus
  - Adding any new InputAdapter that needs to influence app-wide state outside the focus engine itself
related_components:
  - testing_framework
  - frontend_stimulus
tags:
  - spatial-navigation
  - input
  - pointer
  - mouse
  - wheel
  - last-input-wins
  - focus-management
  - lrud
  - css-data-attributes
---

# Pointer-aware spatial navigation without breaking the device-agnostic architecture

## Context

The decoupled spatial-navigation stack documented in [decoupled-spatial-navigation-2026-05-01.md](./decoupled-spatial-navigation-2026-05-01.md) already supported keyboard and gamepad — every focusable was a native `<button>` / `<a>`, the input bus emitted semantic actions, LRUD handled directional resolution, and components carried no navigation imports.

Mouse interaction worked accidentally: clicks fired because the underlying elements were real focusables. But the mouse never participated in the spatial focus state. Hovering a tile did not "light it up" the way arrow-key navigation did. `:focus-visible` deliberately skipped mouse-induced focus, so any visible "active tile" treatment was keyboard/gamepad only. There was no input-mode awareness, so on desktop the cursor was always visible even while the user drove the UI with arrow keys, and there was no path for a mouse to coexist with directional input on TV-style targets.

Korri ships to both desktop and TV targets, so all three input families (mouse, keyboard, gamepad) needed to share one unified focus model. The interesting design question wasn't "add a mousemove listener" — that part is trivial. It was "how do we extend the architecture without dragging device knowledge into components, without breaking the bus' purity, and without timing heuristics to keep mode flips coherent."

## Guidance

Four patterns make pointer parity work without breaking the existing architecture.

### 1. Tag InputActions with `source` instead of using timing heuristics

When a downstream consumer needs to know **which adapter emitted an action**, tag the action with an optional `source` discriminator at emit time. Don't try to recover that information from timestamps or recency windows.

```ts
// korri/shared/input/types.ts
export type InputSource = "keyboard" | "gamepad" | "pointer" | "wheel"

export type InputAction =
  | { readonly type: "direction"; readonly direction: Direction; readonly source?: InputSource }
  | { readonly type: "confirm"; readonly source?: InputSource }
  // ... etc
  | { readonly type: "pointer-activity"; readonly source: "pointer" }
```

Each adapter sets its own source on every emit:

```ts
// korri/shared/input/keyboard-adapter.ts
return { type: "direction", direction, source: "keyboard" }

// korri/shared/input/wheel-adapter.ts
emit({ type: "direction", direction, source: "wheel" })
```

The discriminator is optional — synthetic emits in tests stay valid without it. This is non-breaking by construction.

### 2. Drive cross-cutting state from a single bus listener, not from inside adapters

The input-mode store (`korri/shared/navigation/input-mode.ts`) owns one piece of state: `[data-input-mode]` on `<html>`. It's the only thing that needs to know "is the user using a pointer or directional input right now?"

Two patterns to update it would have worked:

- **Each adapter calls the store directly**: `keyboard-adapter` imports `setDirectionalMode()` and calls it on direction emits.
- **Single bus listener wired in `start.ts`**: adapters stay pure; one listener subscribes to the bus and dispatches based on `source`.

The second pattern is better because **adapters stay independent of the store**. The bus is already the integration seam between adapters and consumers; reusing it for mode dispatch keeps the architecture's layer boundaries intact.

```ts
// korri/shared/navigation/start.ts
const inputMode = createInputModeStore()
bus.on(action => {
  const source = action.source
  if (source === "pointer" || source === "wheel") {
    inputMode.setPointerMode()
    return
  }
  if ((source === "keyboard" || source === "gamepad") && action.type === "direction") {
    inputMode.setDirectionalMode()
  }
})
```

The full dispatch matrix:

| Source | Action type | Mode result |
|---|---|---|
| `pointer` | `pointer-activity` | `pointer` |
| `wheel` | `direction` | `pointer` (wheel is pointer-driven) |
| `pointer` | `options` (right-click) | (no change) |
| `keyboard` | `direction` | `directional` |
| `gamepad` | `direction` | `directional` |
| `keyboard` / `gamepad` | `confirm` / `back` / `options` / `menu` | (no change) |
| undefined (synthetic / test) | any | (no change) |

The "no change" rows matter. Without source-aware dispatch, a wheel-emitted `direction` would flip mode to `directional` mid-scroll and hide the cursor — exactly what the user did not intend. With the matrix, wheel is correctly classified as a pointer-driven directional source.

### 3. Use `[data-input-mode]` plus `:focus`, not `:focus-visible`, for spatial-nav focus rings

`:focus-visible` is browser-defined to skip mouse-induced focus. That is the right behavior for form controls (you don't want a giant ring on a button you just clicked), and the **wrong** behavior for tile-style spatial-nav UIs where the active tile must be visible regardless of how the user got there.

The replacement rule:

```css
@layer base {
  /*
   * Unified spatial-navigation focus ring. Applied via :focus (not
   * :focus-visible) so the ring fires for both keyboard/gamepad-induced
   * focus and pointer-induced focus. The pointer adapter calls .focus()
   * on hover, so this rule is what makes a hovered tile look identical
   * to a keyboard-focused tile.
   */
  :focus {
    outline: 3px solid var(--ring);
    outline-offset: 2px;
    border-radius: 4px;
  }
}

@layer utilities {
  /*
   * Hide the OS cursor while in directional mode. Descendant-and-self
   * selector raises specificity to (0,1,1), beating per-element
   * cursor:pointer at (0,0,1). Placed in @layer utilities so it
   * cascades after @layer components — wins over component-level
   * cursor declarations on buttons and cards.
   */
  [data-input-mode="directional"],
  [data-input-mode="directional"] * {
    cursor: none;
  }
}
```

`:focus-visible`-based styling on form controls (e.g., shadcn-style `<button>` rings inside dialogs) is preserved. The unified rule is for the spatial-nav focusable surface; the form-control rule is for fields where the historic mouse-suppressing behavior is still right.

### 4. Opt-in container attributes parameterize cross-cutting behavior without component APIs

The wheel adapter is opt-in per container via `data-pointer-wheel="vertical" | "horizontal" | "2d"`:

```tsx
// korri/shared/design-system/components/Tilegrid/TilegridScrollRoot.tsx
<div ref={ref} data-pointer-wheel="2d" style={{ /* ... */ }}>
  {children}
</div>

// korri/shared/design-system/components/Tilegrid/TilegridRailRoot.tsx
<div data-pointer-wheel="horizontal" style={{ /* ... */ }}>
  {children}
</div>
```

The wheel adapter walks up from `event.target` to find the nearest `[data-pointer-wheel]` ancestor. Inside it, wheel events are consumed (delta-accumulated, emitted as `direction` actions, and `preventDefault`ed). Outside it, native scroll proceeds untouched.

This mirrors LRUD's existing attribute-hint convention (`lrud-container`, `data-block-exit`, `data-lrud-overlap-threshold`). No component prop is added; consumers don't import a hook; the cross-cutting behavior layer reads the live DOM. The horizontal-vs-2d mapping is a real product distinction (a horizontal rail expects vertical wheel motion to scroll it sideways, desktop carousel convention) that geometry alone cannot infer — the attribute is the right shape because it captures **intent**, not just **layout**.

## Why This Matters

- **Architecture compounds.** The decoupled-spatial-navigation contract said adapters are interchangeable and components stay native. Adding pointer support tested that claim. Two new adapter files (`pointer-adapter.ts`, `wheel-adapter.ts`) plus a tiny store and a CSS rule change — and zero component-level changes — proved the architecture holds. If the original design had required components to opt in to a navigation hook, the same change would have touched every focusable.

- **Source-tagged actions remove timing fragility.** Without `source`, the input-mode store would need a "ignore direction emits within N ms of pointer-activity" rule to suppress the wheel-flips-mode bug. That's brittle: a slow wheel tick crosses the threshold; a fast keyboard repeat might too. Source-tagging is structural — the adapter knows what it is and says so on every emit.

- **Hover moves real DOM focus, not a parallel visual state.** A naive implementation would track "the hovered tile" in a separate state slot and conditionally apply a hover class. Then arrow-key navigation has to reconcile: which is the "real" focus? With a single source of truth (`document.activeElement`), the next arrow press starts from the hovered tile automatically — LRUD already runs from `document.activeElement`, no reconciliation needed.

- **`:focus-visible` is wrong for hybrid TV/desktop UIs.** The browser-defined heuristic is a good default for form controls but encodes assumptions that don't hold for tile-style nav. The `[data-input-mode]` attribute is the explicit replacement: instead of relying on the browser's guess about whether to show a ring, we tell the browser explicitly via runtime-controlled state.

- **Touch is a different input model and should stay separate.** Synthetic mouse events on tap are inconsistent across browsers and would re-show a cursor that has no physical presence. The pointer adapter filters `pointerType === "touch"` (and `"pen"`) entirely. A future touch adapter handles touch on its own terms — swipe → direction, long-press → options — without contaminating pointer-mode logic.

## When to Apply

- You are extending a device-agnostic input architecture with a new device (pointer, touch, remote, voice, eye-tracking) and need to keep components naive.
- You have a hybrid UI that must respond to either pointer or directional input depending on context, and you want one visual treatment regardless of which input drove focus.
- You need cross-cutting state (input mode, motion-pref, accessibility flags) that downstream CSS or React consumers branch on, and you want to drive it from a pub/sub bus rather than from per-adapter side effects.
- You need a layer-level behavior (wheel-as-direction, snap-scroll, gesture recognition) that should be opt-in per container without adding a component API.

## Examples

### Source-tagged action discrimination (pattern, transferable)

When extending any pub/sub bus where downstream consumers need emitter identity:

```ts
// Bad — recipient guesses based on timing
const recentPointerActivity = ref<number>(0)
bus.on(action => {
  if (action.type === "direction") {
    if (Date.now() - recentPointerActivity.value < 150) {
      // assume wheel — keep pointer mode? but maybe not?
    } else {
      setDirectionalMode()
    }
  }
})

// Good — emitter identity flows through the channel
bus.on(action => {
  if (action.source === "wheel" || action.source === "pointer") {
    setPointerMode()
  } else if (action.source === "keyboard" || action.source === "gamepad") {
    if (action.type === "direction") setDirectionalMode()
  }
})
```

### Last-input-wins styling (pattern, transferable)

```css
/* In any hybrid TV/desktop UI: drive cursor + focus styling from a runtime
   attribute updated by the input layer. */
[data-input-mode="directional"],
[data-input-mode="directional"] * {
  cursor: none;
}

/* Use plain :focus, not :focus-visible, when both pointer-induced and
   directional-induced focus must look the same. */
:focus {
  outline: 3px solid var(--ring);
  outline-offset: 2px;
}
```

### Opt-in container attribute (pattern, transferable)

```tsx
// Component contract stays the same. The attribute is the only opt-in
// surface for the cross-cutting behavior. Consumers reach for it when
// they want it; it's invisible to consumers who don't.
<TilegridRailRoot
  data-pointer-wheel="horizontal"
  items={recentlyPlayed}
  cellSize={140}
>
  <TilegridCells renderCell={renderTile} />
</TilegridRailRoot>
```

## Implementation gotchas worth flagging

1. **Adapters must stay pure for unit-testability.** When the input-mode store is wired in `start.ts` (not imported by adapters), each adapter's tests don't need to mock the store. The dispatch matrix is exercised in `start.test.ts` against a clean bus.
2. **`mousemove` does not natively tell you which element is "under" the cursor.** Use `event.target.closest(focusableSelector)` to walk up from the event's actual target. Don't reach for `document.elementFromPoint(clientX, clientY)` — `event.target` plus `closest()` is the same answer at lower cost.
3. **Drive hover focus from `mousemove`, not `mouseover`/`mouseenter`.** `mouseover` fires when an element transitions under the cursor due to scroll, even with the cursor stationary. That makes focus chase tiles passing under a still cursor — jarring. `mousemove` only fires on real cursor motion.
4. **Sub-pixel cursor jitter must be gated.** Without a movement threshold (default 1 px), every OS-emitted micro-mousemove re-flips mode and re-runs the focus pass. Trackpad palm jitter and OS interpolation make this worse than expected.
5. **Trackpad streams need delta accumulation.** A single trackpad gesture can fire dozens of `wheel` events with `deltaY ≈ 5–15` each. Without accumulation against a per-container threshold, one swipe skips many tiles. Per-container WeakMap keyed by the matched ancestor element is the right granularity (re-entering a container resets the accumulator naturally).
6. **`cursor: none` must beat per-element `cursor: pointer`.** Buttons, cards, and links commonly declare `cursor: pointer`. Setting `cursor: none` only on `<html>` loses on specificity. Either use `[data-input-mode="directional"] *` (specificity (0,1,1) — beats single-element selectors) **and** place it in `@layer utilities` so the @layer cascade order makes it win against `@layer components` declarations, or fall back to `!important`.
7. **Hover must not steal focus from editable elements.** Mirror the keyboard adapter's `ignoreWhenEditable` rule. The user typing in a search box is the canonical case where pointer activity should still flip the mode (cursor reappears) but must not call `.focus()` on the hovered tile.
8. **Right-click should map to `options` only on focusables.** Right-click on empty space should preserve the native context menu. Inside the spatial scope, gamepad parity (the Y/Triangle button maps to `options`) is the rationale.
9. **Touch and pen pointer events should be ignored.** Filter `pointerType === "touch"` and `pointerType === "pen"`. A tap should not enter pointer mode and re-show a cursor that doesn't exist on a touch device.
10. **Wheel adapter must be `passive: false`.** It calls `preventDefault()` inside opted-in containers. Listening passively means the call is a no-op and the page scrolls anyway.

## Related

- [decoupled-spatial-navigation-2026-05-01.md](./decoupled-spatial-navigation-2026-05-01.md) — the upstream architecture this work extends. Note: that doc's recommendation that "`:focus-visible` is the right hook" is correct for the original keyboard/gamepad-only architecture but should be read alongside this doc when adding pointer support, where `:focus` + `[data-input-mode]` replaces it for spatial-nav focusables.
- `korri/shared/input/pointer-adapter.ts`, `korri/shared/input/wheel-adapter.ts` — the new adapters.
- `korri/shared/navigation/input-mode.ts` — the cross-cutting state store driven by source-tagged actions.
- `korri/shared/navigation/start.ts` — the dispatch-matrix wiring point.
- `korri/shared/themes/shift/shift.css` — the `:focus` and `[data-input-mode="directional"]` CSS rules.
- `korri/shared/design-system/components/Tilegrid/TilegridScrollRoot.tsx`, `TilegridRailRoot.tsx` — canonical opt-in consumers of `data-pointer-wheel`.
- `korri/shared/design-system/components/Tilegrid/Tilegrid.pointer.story.e2e.ts`, `Tilegrid.wheel.story.e2e.ts` — story-driven Playwright coverage of the end-to-end behavior.
- Origin brainstorm and plan: `docs/brainstorms/2026-05-01-pointer-aware-spatial-navigation-requirements.md`, `docs/plans/2026-05-01-001-feat-pointer-aware-spatial-navigation-plan.md`.
