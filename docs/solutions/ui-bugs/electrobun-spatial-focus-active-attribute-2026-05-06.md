---
title: Electrobun spatial focus needs an explicit active-focus attribute
date: 2026-05-06
category: ui-bugs
module: korri/shared/navigation + korri/shared/themes/shift
problem_type: ui_bug
component: tooling
symptoms:
  - "Shift active tile outline is visible in desktop Storybook but missing in the Electrobun Odin renderer"
  - "Spatial navigation can move focus and activate controls while the screen shows no active item"
  - "Switching from :focus-visible to :focus may still not restore a visible active style in embedded WebKit"
  - "Labs can open after confirm routing is fixed, but the currently focused tile/control still has no visible halo"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
related_components:
  - frontend_stimulus
  - testing_framework
tags: [electrobun, webkit, spatial-navigation, focus-management, active-tile, css, shift-theme, odin]
---

# Electrobun spatial focus needs an explicit active-focus attribute

## Problem

Korri's Shift home surface used CSS pseudo-classes (`:focus-visible`, then `:focus`) as the only visual hook for the active spatial-navigation item. That worked in desktop Storybook, but the Electrobun/WebKit Odin renderer could move and activate focus while failing to show the active tile/control halo.

## Symptoms

- The active outline was visible on desktop Storybook but absent in Electrobun on Thor/Odin.
- Directional input and confirm still reached real controls; the failure was visual, not navigation reachability.
- The Labs button could be focused and activated after confirm routing was fixed, but the active item still had no visible cue.
- Changing Shift selectors from `:focus-visible` to `:focus` improved browser parity in normal Chromium/Storybook but was not sufficient in the embedded WebKit runtime.

## What Didn't Work

- **Relying on Storybook/desktop browser verification alone.** Storybook painted the focus state correctly, so it did not reproduce the Electrobun/WebKit rendering gap.
- **Using `:focus-visible` for spatial focusables.** `:focus-visible` is browser-heuristic-driven and intentionally suppresses some focus indicators. It is the wrong sole hook for TV-style active-tile state.
- **Changing every Shift focus selector to plain `:focus`.** This is still the correct first-line selector for hybrid pointer/directional UIs, but Electrobun showed that a runtime may hold focus and still not paint pseudo-class-driven active styling reliably.
- **Adding component-level focused state.** Mirroring focus in Shift tiles, Labs buttons, or Tilegrid cells would break the architecture: components must remain native HTML, and the navigation layer owns cross-cutting focus behavior.

## Solution

Mirror DOM focus into a navigation-layer data attribute and let theme CSS target either the native pseudo-class or the explicit attribute.

```ts
// korri/shared/navigation/active-focus-attribute.ts
export const ACTIVE_FOCUS_ATTRIBUTE = "data-korri-active-focus"

export function createActiveFocusAttribute(
  options: ActiveFocusAttributeOptions = {},
): ActiveFocusAttribute {
  const target =
    options.target ?? (typeof document !== "undefined" ? document : null)

  if (!target) return { dispose: () => {} }

  let current: HTMLElement | null = null

  const mark = (next: HTMLElement | null) => {
    if (current === next) return
    current?.removeAttribute(ACTIVE_FOCUS_ATTRIBUTE)
    current = null
    if (!isMeaningfulFocusTarget(next)) return
    next.setAttribute(ACTIVE_FOCUS_ATTRIBUTE, "")
    current = next
  }

  target.addEventListener("focusin", event => mark(asHTMLElement(event.target)), true)
  mark(asHTMLElement(document.activeElement))

  return {
    dispose() {
      current?.removeAttribute(ACTIVE_FOCUS_ATTRIBUTE)
    },
  }
}
```

Wire the mirror into the same lifecycle as the focus engine and focus retention:

```ts
// korri/shared/navigation/start.ts
const activeFocusAttribute =
  options.activeFocusAttribute === false
    ? null
    : createActiveFocusAttribute(options.activeFocusAttribute ?? undefined)

const handle: SpatialNavigationHandle = {
  bus,
  inputMode,
  dispose: () => {
    disposeDiagnostics()
    focusRetention?.dispose()
    activeFocusAttribute?.dispose()
    bus.dispose()
    inputMode?.dispose()
    if (currentHandle === handle) setCurrentHandle(null)
  },
}
```

Then make Shift focus styles resilient to either mechanism:

```css
/* korri/shared/themes/shift/shift.css */
[data-shift-home] .shift-tile:is(:focus, [data-korri-active-focus])::after {
  border-color: var(--shift-focus-glow);
}

[data-shift-home] .shift-pill:is(:focus, [data-korri-active-focus]) {
  box-shadow: 0 0 0 3px var(--shift-focus-glow);
  transform: translateY(-1px);
}
```

The same attribute can be used for Shift's Labs, search, menu, and dialog controls without adding any React props or navigation hooks to those components.

## Why This Works

The fix keeps `document.activeElement` as the canonical active target. It does not introduce a separate selected-tile state; it only exposes the current DOM focus as a stable CSS selector that embedded runtimes cannot choose to suppress the way they can suppress or fail to repaint pseudo-class styling.

Because the attribute is installed in `startSpatialNavigation()`, it remains a navigation-layer concern:

- Components stay native (`button`, `a`, `input`, `[tabindex]`) and do not import focus hooks.
- The attribute updates for keyboard, native gamepad, pointer, dialog restore, and programmatic focus paths because all of them eventually produce DOM `focusin`/`focusout`.
- Disposal removes the attribute, so HMR/restart paths do not leave stale active markers in the DOM.
- CSS can preserve normal browser behavior with `:focus` while using `[data-korri-active-focus]` as a renderer-compatibility fallback.

The earlier Labs activation issue had a separate cause: page-level `useInputAction("confirm")` launched the focused game in addition to the focus engine clicking the currently focused control. Removing that duplicate confirm handler let the focused Labs button own confirm through native `.click()`, while the active-focus attribute restored the visible active state.

## Prevention

- For TV/kiosk spatial surfaces, avoid making browser pseudo-classes the only active-state contract. Pair `:focus` with a navigation-owned attribute when targeting embedded webviews or native wrappers.
- Keep focus mirroring under `korri/shared/navigation/*`; do not add component-local `focused` props or navigation-library hooks to atoms and molecules.
- Regression-test the lifecycle directly: focusing one element should add `data-korri-active-focus`, focusing another should move it, and disposing spatial navigation should remove it.
- Verify focus visuals on the actual renderer when a bug only reproduces there. Storybook/desktop Chromium can prove the CSS is valid while Electrobun/WebKit still fails to paint it.
- Treat duplicate semantic action handlers as suspect: if the focus engine already turns `confirm` into `.click()`, page-level `confirm` handlers should not also perform the focused element's action.

## Related Issues

- `docs/solutions/ui-bugs/spatial-focus-vacuum-retention-2026-05-04.md` — related focus lifecycle fix; keeps DOM focus from falling back to `<body>`/`<html>` after background clicks.
- `docs/solutions/best-practices/pointer-aware-spatial-navigation-2026-05-01.md` — explains why spatial focusables use `:focus`, not `:focus-visible`, in hybrid pointer/directional UIs.
- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — architecture rule: components stay native and navigation behavior lives in shared input/navigation layers.
- `docs/solutions/ui-bugs/inset-outline-clipped-by-overflow-hidden-2026-05-01.md` — related browser-specific focus-ring rendering failure; solved with a CSS pseudo-element rather than an active-focus attribute.
- `docs/solutions/integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md` — broader Electrobun/WebKit runtime context for Odin.
- `korri/shared/navigation/active-focus-attribute.ts`, `korri/shared/navigation/start.ts`, and `korri/shared/themes/shift/shift.css` — implementation entry points.
