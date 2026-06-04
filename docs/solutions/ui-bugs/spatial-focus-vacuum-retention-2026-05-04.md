---
title: Prevent spatial focus vacuums after background clicks
date: 2026-05-04
category: ui-bugs
module: korri/shared/navigation + korri/shared/input + korri/shared/themes
problem_type: ui_bug
component: tooling
symptoms:
  - "Clicking non-focusable canvas or background space can leave no tile visibly active"
  - "After focus falls back to body/html, the next directional input can restart from initial focus instead of the previously active tile"
  - "Pointer-induced focus may not show the Shift tile halo when styling relies on :focus-visible"
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components:
  - testing_framework
tags:
  - spatial-navigation
  - focus-management
  - pointer
  - lrud
  - active-tile
  - focus-retention
  - storybook
  - accessibility
---

# Prevent spatial focus vacuums after background clicks

## Problem

Korri's launcher-style surfaces treat DOM focus as the canonical active tile: the visual halo, caption state, and next LRUD move all derive from `document.activeElement`. Pointer interaction on non-focusable background/canvas space could blur the active tile back to `<body>`/`<html>`, leaving the UI with no meaningful focus and no active tile.

## Symptoms

- The focused tile visually deselects after a click on non-focusable space.
- `document.activeElement` becomes `document.body` or `document.documentElement` instead of the previously active button.
- The next arrow/gamepad direction can behave like startup navigation, because the focus engine no longer has the intended current element as its origin.
- Pointer-restored or pointer-induced focus may not show the Shift tile halo if the tile styling uses `:focus-visible` instead of `:focus`.

## What Didn't Work

- **Patching Shift or Tilegrid state.** Keeping a separate `selectedId` or `focusedId` after DOM focus is empty creates a second source of truth. It may make one theme look active while LRUD still starts from the wrong DOM element.
- **Solving it inside each component.** Tiles, menu items, and other spatial focusables all share the same invariant. Per-component focus hooks or props would break the architecture that keeps components as native HTML.
- **Preventing all background pointer defaults.** Broad `pointerdown.preventDefault()`/`mousedown.preventDefault()` risks breaking text selection, editable-control blur, native context menus, and normal click-away behavior. The narrower fix is to repair only the empty-focus state after the browser has settled.
- **Changing LRUD fallback behavior.** The focus engine should still have a startup fallback when there is genuinely no current focus. The bug is that an already-focused spatial surface was allowed to fall into that startup state.

## Solution

Add a shared navigation-layer focus-retention helper and wire it into `startSpatialNavigation()` by default.

The helper remembers the last focused non-editable, non-ignored focus target. When that element blurs, it schedules a settled-focus check. If another meaningful element gained focus, it does nothing. If focus fell to `<body>`, `<html>`, or no meaningful element, it restores the retained target with `preventScroll: true`.

```ts
// korri/shared/navigation/focus-retention.ts
const onFocusOut = (event: Event) => {
  const blurred = asHTMLElement(event.target)
  if (!lastRetainable || blurred !== lastRetainable) return

  const token = generation
  const retained = lastRetainable
  schedule(() => {
    if (disposed || token !== generation) return
    if (!retained.isConnected || !isRetainableFocusTarget(retained)) return

    const active = asHTMLElement(document.activeElement)
    if (isMeaningfulFocusTarget(active)) return

    retained.focus({ preventScroll: true })
  })
}
```

Wire it through the spatial-navigation lifecycle rather than a component lifecycle:

```ts
// korri/shared/navigation/start.ts
const focusRetention =
  options.focusRetention === false
    ? null
    : createFocusRetention(options.focusRetention ?? undefined)

const handle: SpatialNavigationHandle = {
  bus,
  inputMode,
  dispose: () => {
    disposeDiagnostics()
    focusRetention?.dispose()
    bus.dispose()
    inputMode?.dispose()
    if (currentHandle === handle) setCurrentHandle(null)
  },
}
```

Keep editable controls out of retention so platform click-away behavior still works:

```ts
function isRetainableFocusTarget(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false
  if (!el.isConnected) return false
  if (!el.matches(FOCUSABLE_SELECTOR)) return false
  if (el.matches(":disabled")) return false
  if (isEditableElement(el)) return false
  if (el.getAttribute("tabindex") === "-1") return false
  if (el.closest(".lrud-ignore")) return false
  return true
}
```

Finally, spatial tiles that must look active for pointer and restored focus should use `:focus`, not `:focus-visible`:

```css
[data-shift-home] .shift-tile:focus::after {
  border-color: var(--shift-focus-glow);
}
```

## Why This Works

The fix preserves the established invariant: DOM focus is the single active-tile source of truth. Instead of creating a parallel selection state, the navigation layer prevents accidental focus vacuums from persisting.

The delayed check is important. Browser focus changes happen as a sequence: the old element can emit `focusout` before the new target receives focus. Restoring synchronously would fight legitimate focus transitions. Scheduling a microtask lets normal clicks on another button, dialog controls, or other meaningful targets win. Retention only runs when the settled state is empty.

The filtering rules keep the behavior spatial-navigation-specific without component APIs:

- Buttons, anchors, and tabindex focusables can be retained.
- `input`, `textarea`, `select`, and contenteditable regions are not retained.
- Disconnected or disabled elements are not restored.
- Elements inside `.lrud-ignore` are ignored.
- `focus({ preventScroll: true })` avoids browser focus-scroll racing the focus engine or Mario-camera scroll behavior.

## Prevention

- Treat `<body>`/`<html>` focus as a focus vacuum for launcher-style spatial surfaces once a real spatial focus target has existed.
- Keep focus-retention logic under `korri/shared/navigation/*`; do not add per-component selected state to hide a DOM focus bug.
- For browser regressions, assert both sides of the invariant:
  - background/canvas click keeps the same focused tile;
  - the next directional move starts from that retained tile's real LRUD neighbor.
- Preserve editable-control blur behavior in tests. A retention helper that re-focuses inputs after click-away is too broad.
- Use `:focus` for tile-style spatial focus rings that must appear for keyboard, gamepad, pointer, and restored focus. Reserve `:focus-visible` for conventional form-control focus affordances.

## Related Issues

- `../../../work/.archive/01KQR4HQ0P7SFD5ZVZ4D0V9EJN-fix-spatial-focus-deselection/plan.md` — implementation plan and requirements trace for this fix.
- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — architecture rule: components stay native; navigation behavior belongs in shared input/navigation layers.
- `docs/solutions/best-practices/pointer-aware-spatial-navigation-2026-05-01.md` — pointer support keeps `document.activeElement` as the canonical active tile and uses `:focus` for spatial focusables.
- `docs/solutions/best-practices/snap-to-center-scroll-camera-implementation-gotchas-2026-05-01.md` — related focus/scroll discipline around `preventScroll: true` and avoiding focusin-gated behavior.
- `korri/shared/navigation/focus-retention.ts` and `korri/shared/navigation/start.ts` — implementation entry points.
- `korri/shared/primitives/components/Tilegrid/Tilegrid.pointer.story.e2e.ts` — browser-level regression coverage for attempted deselection.
