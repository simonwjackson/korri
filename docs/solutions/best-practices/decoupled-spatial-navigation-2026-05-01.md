---
title: Device-agnostic spatial navigation without coupling components
date: 2026-05-01
last_updated: 2026-05-01
category: best-practices
module: shared/input + shared/navigation
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Building TV, launcher, or gamepad-style UIs where every interactive element must be reachable via directional input
  - Targeting multiple input devices (keyboard, gamepad, remote, touch) with shared semantics
  - Wanting to keep components free of navigation-library imports
related_components:
  - testing_framework
tags:
  - spatial-navigation
  - input
  - focus-management
  - lrud
  - gamepad
  - accessibility
  - storybook
  - decoupling
---

# Device-agnostic spatial navigation without coupling components

## Context

The first attempt used `@noriginmedia/norigin-spatial-navigation`. It works but forces every focusable component to import a hook, hold a ref, and consume `focused` state:

```tsx
const { ref, focused } = useFocusable<HTMLDivElement>({
  onEnterPress: () => onClick(item),
  focusKey: `grid-item-${item.id}`,
})
```

Two problems compound from there:

1. **Every new component opts into navigation explicitly.** Atoms can't be naive HTML. A `<Card>` becomes a `<motion.div>` wired to a focus library instead of a `<button>`.
2. **Input is locked to keyboard.** Norigin listens to `keydown` only. Adding gamepad, remote, or touch directional input means monkey-patching its key handler or replacing the library.

The goal: every interactive element navigable via directional input and action keys, decoupled from any specific device, with components that don't know the navigation system exists.

## Guidance

Three layers, each with a single responsibility, none of which import each other's internals:

```
korri/shared/input/                  ← device-agnostic semantic input
  types.ts                             InputAction, InputAdapter, Direction
  bus.ts                               pub/sub
  keyboard-adapter.ts                  KeyboardEvent → InputAction
  gamepad-adapter.ts                   navigator.getGamepads() → InputAction (rAF poll)

korri/shared/navigation/             ← DOM focus driver
  focus-engine.ts                      InputAction → element.focus() / .click()
                                       (nextFocus algorithm is INJECTED)
  start.ts                             one-call wiring; LRUD adapter at the seam
```

### Layer 1: a semantic action bus

The bus emits **actions**, not key codes:

```ts
export type InputAction =
  | { readonly type: "direction"; readonly direction: "up" | "down" | "left" | "right" }
  | { readonly type: "confirm" }
  | { readonly type: "back" }
  | { readonly type: "options" }
  | { readonly type: "menu" }
```

Adapters implement one interface:

```ts
export interface InputAdapter {
  readonly name: string
  start(emit: (action: InputAction) => void): () => void
}
```

The keyboard adapter has a configurable keymap and ignores events while editable elements are focused. The gamepad adapter polls `navigator.getGamepads()` per `requestAnimationFrame`, supports both d-pad and the left analog stick, and applies key-style auto-repeat to held directions.

### Layer 2: a DOM focus engine with the algorithm injected

```ts
export type NextFocusFn = (
  current: Element | null,
  direction: Direction,
  scope?: HTMLElement,
) => HTMLElement | null

export function createFocusEngine(opts: FocusEngineOptions): FocusEngine
```

The engine knows the DOM (calls `.focus()` and `.click()`), but does not know any specific spatial-navigation library. The algorithm is a pluggable function. The default wiring uses `@bbc/tv-lrud-spatial`, a small library (~55 stars, BBC-maintained) that reads the live DOM and treats native focusables (`a`, `button`, `input`, `[tabindex]`) as candidates. CSS classes (`lrud-container`, `lrud-ignore`) and data attributes (`data-block-exit`, `data-lrud-overlap-threshold`) provide hints — never component APIs.

### Layer 3: components stay native HTML

A grid item that used to be:

```tsx
const { ref, focused } = useFocusable({ onEnterPress: () => onClick(item) })
return (
  <motion.div ref={ref} onClick={() => onClick(item)}
    style={{ outline: focused ? "3px solid #3b82f6" : "none" }} />
)
```

becomes:

```tsx
return (
  <motion.button type="button" onClick={() => onClick(item)} />
)
```

The `:focus-visible` ring lives in theme CSS, applied globally:

```css
:focus-visible {
  outline: 3px solid var(--ring, #3b82f6);
  outline-offset: 2px;
}
```

### Wiring is one line

```ts
// korri/deploy/portal/main.tsx
import { startSpatialNavigation } from "@shared/navigation/start"

startSpatialNavigation()
```

Routes that need `back` or `menu` subscribe to semantic actions rather than reaching into components:

```tsx
const router = useRouter()
const canGoBack = useCanGoBack()

useInputAction("back", () => {
  if (canGoBack) router.history.back()
})
```

## Why This Matters

- **Components don't drift.** A new atom is a `<button>` with `aria-label`. There is no checklist of nav imports to add. Refactors don't break navigation because navigation is read off the DOM, not declared in code.
- **Devices are interchangeable.** Adding remote-control or touch swipe is one new file implementing `InputAdapter`. Existing components see no change.
- **The library is replaceable.** LRUD is invoked at a single point in `start.ts`. If it ever fails (becomes abandoned, has performance issues, doesn't match a TV's geometry), swap in another `NextFocusFn` without touching the engine, the bus, or any component.
- **Storybook becomes the test surface.** Stories exercise the same nav layer as the running app (the preview file calls `startSpatialNavigation()` at module scope). Playwright drives stories headlessly to assert focus moves, Enter activates, and ArrowLeft after ArrowRight returns to origin.
- **Accessibility comes for free.** `:focus-visible` works for Tab navigation, screen readers see real `<button>`s, and the same DOM serves spatial nav, mouse clicks, and assistive tech.

## When to Apply

- TV, launcher, kiosk, console-style, or arcade UIs where directional input is primary
- Apps that need keyboard + gamepad parity without per-component branching
- Any app where you want a hard rule: *components never import the navigation library*
- Multi-input projects (mouse + keyboard + gamepad + remote) that need shared semantic verbs (`confirm`, `back`, `options`, `menu`)

## Examples

### Before — every component coupled

```tsx
// GridView.tsx (old)
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation"

function FocusableGridItem({ item, onItemClick }) {
  const { ref, focused } = useFocusable<HTMLDivElement>({
    onEnterPress: () => onItemClick?.(item),
    focusKey: `grid-item-${item.id}`,
  })
  return (
    <motion.div
      ref={ref}
      onClick={() => onItemClick?.(item)}
      style={{ outline: focused ? "3px solid #3b82f6" : "none" }}
    />
  )
}
```

### After — component is native HTML

```tsx
// GridView.tsx (new)
function GridItemTile({ item, onItemClick }) {
  return (
    <motion.button
      type="button"
      aria-label={item.id}
      onClick={() => onItemClick?.(item)}
    />
  )
}
```

No nav imports. No refs. No `focused` state. The `:focus-visible` ring comes from theme CSS. Spatial nav comes from the global engine reading the live DOM.

### React consumers subscribe to a restart-aware singleton

Route code should subscribe to semantic actions through `useInputAction`, not by capturing a one-off bus reference:

```tsx
useInputAction("back", () => {
  if (canGoBack) router.history.back()
})
```

The hook is backed by `useSyncExternalStore`, so if `startSpatialNavigation()` restarts during HMR or any future runtime reinitialization, mounted route handlers unsubscribe from the disposed bus and resubscribe to the new one. Without this, product code can silently stop receiving `back`, `menu`, or `options` after a navigation-layer restart.

### Storybook integration

```tsx
// korri/deploy/storybook/preview.tsx
import { startSpatialNavigation, type SpatialNavigationHandle } from "@shared/navigation/start"

declare global {
  interface Window { __korriSpatialNav?: SpatialNavigationHandle }
}

// HMR-safe: dispose the prior instance before creating a new one,
// otherwise listeners and the gamepad rAF loop pile up across hot reloads.
window.__korriSpatialNav?.dispose()
window.__korriSpatialNav = startSpatialNavigation()
```

### Playwright story-driven test

```ts
// korri/shared/themes/shift/organisms/GameGrid.story.e2e.ts
test("ArrowDown / ArrowRight move focus across cards", async ({ page }) => {
  await page.goto("/iframe.html?id=themes-shift-organisms-gamegrid--grid&viewMode=story")
  await page.locator("button[aria-label]").first().focus()

  await page.keyboard.press("ArrowRight")
  // ... assert focused element changed
})
```

## Implementation gotchas worth flagging

1. **Bun and Playwright collide on `*.spec.ts`.** Bun's test discovery hardcodes `.test`, `_test_`, `.spec`, `_spec_` substring matching and runs anything matching as a unit test — Playwright's `test.describe()` then crashes with "did not expect test.describe() to be called here". The fix is to give Storybook-driven Playwright specs a suffix Bun won't match. This repo uses `*.story.e2e.ts`. The Playwright component config matches `korri/**/*.story.e2e.ts`; the e2e config's separate `testDir` keeps the two from cross-loading.
2. **HMR re-evaluates `preview.tsx`.** Without disposal, every hot reload adds another keyboard listener and another `requestAnimationFrame` polling loop. Stash the handle on `window` and dispose before re-init.
3. **Disposing the old singleton is not enough.** If React consumers subscribe to `getInputBus()` once, they stay attached to the old, disposed bus after `startSpatialNavigation()` replaces it. Expose singleton changes as an external store and build hooks with `useSyncExternalStore` so consumers resubscribe after restarts.
4. **Focus restore should not interpolate arbitrary attributes into CSS selectors.** `aria-label` and `id` values can contain quotes, newlines, or other selector-hostile characters. Prefer direct attribute comparison over constructing selectors like `[aria-label="..."]`; it is safer and can also match the scope element itself.
5. **`preventDefault` should be conditional.** The keyboard adapter must skip when the focused element is editable (`<input>`, `<textarea>`, `[contenteditable]`), or arrow keys break text editing.
6. **`Tab` and `options` are different verbs.** Don't map `Tab` to `options` — Tab is critical for accessibility. Leave `options` and `menu` unmapped on keyboard by default; let gamepad cover them.
7. **`:focus-visible` is the right hook.** It triggers for keyboard / gamepad / programmatic focus but not mouse clicks, which is exactly the desired UX.

## Related

- `@bbc/tv-lrud-spatial` — chosen for its DOM-driven, component-agnostic API. Alternatives evaluated: `@noriginmedia/norigin-spatial-navigation` (couples components via hooks), `WICG/spatial-navigation` polyfill (archived), `bamlab/react-tv-space-navigation` (React Native only).
- `korri/shared/input/` and `korri/shared/navigation/` — the implementation referenced here.
- `korri/shared/navigation/use-input-action.ts` — restart-aware React subscription hook for semantic actions.
- `korri/shared/navigation/focus-restore.ts` — focus restoration across remounts; uses direct attribute matching for `id` / `aria-label` identities.
- `korri/deploy/storybook/preview.tsx` — Storybook integration, the canonical demo surface.
- `tools/playwright/playwright.component.config.ts` — Storybook-driven Playwright runner.
