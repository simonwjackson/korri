---
title: "feat: Spatial navigation follow-ups (bus access, tests, router integration, focus restore)"
type: feat
status: active
date: 2026-04-30
---

# feat: Spatial navigation follow-ups

## Overview

The decoupled spatial-navigation foundation landed in commits `9b48db2`, `6e7dac1`, and `ee54afa` (input bus + adapters, LRUD-driven focus engine, Storybook-driven Playwright spec). Components are now native HTML, the engine is initialized in `main.tsx` and `preview.tsx`, and one component spec proves keyboard navigation works end-to-end.

This plan lands the remaining work that makes the foundation **usable from the rest of the app** and **resilient under change**:

1. A clean way for React/router code to reach the input bus without window globals.
2. Unit coverage for the new shared modules (currently zero).
3. Router integration for the `back` action (the canonical proof that the bus extension pattern works).
4. Focus restore across DOM remounts (route changes, Suspense resolution, modal close).
5. A gamepad-driven Playwright spec to guard against regressions in the polling/repeat code path.
6. Working-agreement updates so contributors know not to import nav libs in components and can find institutional learnings.

## Problem Frame

The committed work proves the architecture inside Storybook, but the running portal still can't *use* the architecture. There is no public way to subscribe to `back` from a route, no unit tests on the heart of the system (bus, engine, adapters), and no policy in `AGENTS.md` preventing the next contributor from re-introducing `useFocusable`-style coupling.

Without these follow-ups:

- The compound learning in `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` describes a pattern that isn't actually exercised by any product code.
- A regression in `gamepad-adapter.ts` (e.g. broken stick repeat) would ship silently.
- Contributors discovering the codebase have no signal that components must stay native HTML.

## Requirements Trace

- **R1.** Product code (routes, features) can subscribe to `back`, `menu`, and `options` without touching `window` globals or Storybook-specific seams.
- **R2.** The input bus, keyboard adapter, gamepad adapter, and focus engine each have unit coverage proving their core behavior (event emission, keymap matching, hold/repeat semantics, focus dispatch).
- **R3.** Pressing the `back` action from inside the portal navigates back via TanStack Router history.
- **R4.** When focus is on element X and the route remounts (router back, Suspense resolution), focus returns to X (or the closest equivalent) on re-render, instead of falling to `<body>`.
- **R5.** Gamepad button presses and stick deflections produce the expected `InputAction`s, verified end-to-end via a Playwright spec that shims `navigator.getGamepads`.
- **R6.** The working agreement (`AGENTS.md`) names the navigation policy ("components stay native HTML; no nav-library imports outside `@shared/input` and `@shared/navigation`") and points contributors at `docs/solutions/` for institutional learnings.

## Scope Boundaries

- No new spatial-navigation algorithms beyond LRUD. The engine accepts an injected `nextFocus` already; alternatives can land later if needed.
- No remote-control or touch input adapters. The bus's adapter contract supports them; building one is a future task once a real device target appears.
- No multi-route product features. This plan only adds the infrastructure that supports them; the test for focus restore exercises within-page DOM remounts as a proxy because there is currently only one route.
- No changes to LRUD or its hint attributes (`data-block-exit`, `lrud-container`).

### Deferred to Separate Tasks

- **Schema enum addition for `react_component` / `frontend_architecture`**: Lives in `~/.pi/agent/skills/ce-compound/references/schema.yaml`, outside this repo. Track separately if/when more frontend-architecture solutions get written.
- **Remote-control / touch swipe adapters**: New `InputAdapter` implementations; create when a real device target lands.
- **Per-route `options` and `menu` UX**: There is no product surface yet that needs them. Wire when the first feature requires it (the bus is the seam).

## Context & Research

### Relevant Code and Patterns

- `korri/shared/input/bus.ts` — `InputBus` interface, `createInputBus()`, `onAction(type, listener)` typed subscription.
- `korri/shared/navigation/start.ts` — `startSpatialNavigation()` returns `SpatialNavigationHandle` `{ bus, dispose }`. Currently a function call with no module-level state.
- `korri/shared/navigation/focus-engine.ts` — `createFocusEngine()` is pure (no DOM globals at construction); easy to unit-test with a fake `nextFocus` and happy-dom.
- `korri/deploy/portal/main.tsx` — calls `startSpatialNavigation()` after `ReactDOM.createRoot(...).render(...)`. Captures the handle in a local const that nothing else can reach.
- `korri/deploy/storybook/preview.tsx` — uses `window.__korriSpatialNav` as an HMR-safe handoff. This is fine for Storybook (single-iframe lifecycle) but not the right pattern for the portal.
- `korri/products/app/routes/+__root.tsx` — `RootComponent` with `<Suspense><Outlet /></Suspense>`. Natural spot to register a `back` handler that calls `router.history.back()`.
- `korri/shared/themes/shift/organisms/GameGrid.story.e2e.ts` — existing pattern for Playwright story-driven specs, including `addEventListener` injection via `page.evaluate`. Re-use shape for the gamepad spec.
- `tools/playwright/playwright.component.config.ts` — `testMatch: "korri/**/*.story.e2e.ts"`. New gamepad spec colocates with the same naming convention.
- Existing unit tests under `korri/shared/themes/shift/organisms/*.test.ts` and `korri/shared/utils/*.test.ts` use the Bun test runner with happy-dom registered globally (per `bunfig.toml`). Mirror that style.

### Institutional Learnings

- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — the architectural rationale and gotchas already documented for this work. Keep the plan consistent with the published pattern; if the work reveals corrections, update the solutions doc.
- The "Bun vs Playwright `.spec.ts` collision" gotcha (already documented) means any new test file added by this plan must use either `*.test.ts` (unit) or `*.story.e2e.ts` (Playwright story-driven). No `*.spec.ts`.

### External References

None required. LRUD's API and the Standard Gamepad layout are already wired. TanStack Router's `router.history.back()` and `router.subscribe('onLoad', ...)` patterns are documented in repo usage and the framework docs but not novel for this plan.

## Key Technical Decisions

- **Module-level singleton over React context** for bus access. Keeps the navigation layer free of React entanglement, matches the existing "no provider needed" philosophy, and stays consistent with how `startSpatialNavigation()` is already called outside the React tree in `main.tsx`. A thin `useInputAction(type, handler)` hook can wrap the singleton for ergonomic React subscription with auto-cleanup, but the singleton itself is framework-neutral.
- **Singleton lives in `@shared/navigation/start.ts`** alongside `startSpatialNavigation`. One module owns the lifecycle; consumers import `getSpatialNavigation()` to read the current handle. Throws if called before `startSpatialNavigation()` to surface init-order bugs loudly.
- **Storybook keeps the `window` global wrapper** because HMR re-evaluates `preview.tsx` outside the module-singleton's lifecycle. Singleton + `window` global are not redundant — they serve different lifecycles.
- **`back` handler installed in `RootComponent`**, not in `main.tsx`. Reasoning: the route tree owns navigation policy. The bus is global; the *handler* is route-scoped. Component installs a subscription in `useEffect` and unsubscribes on unmount.
- **Focus restore uses an in-memory map keyed by route path**, with focus identity captured via `aria-label` || `id` || a generated path-from-scope selector. Components do not opt in — `aria-label` is already required for accessibility on the current focusables. Restore happens on the next animation frame after the route resolves to give the new DOM time to mount. If no match is found, fall back to the engine's existing initial-focus behavior (no regression).
- **Gamepad Playwright spec uses `page.addInitScript`** to install a fake `navigator.getGamepads` plus a window-level controller (`window.__fakeGamepad.press(buttonIndex)`). This keeps the actual `gamepad-adapter.ts` untouched in tests — it polls a real-looking API.
- **AGENTS.md gets a single new sub-section** under "Implementation Patterns" called "Spatial navigation", with the policy and a link to `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`. Adding a separate "Lessons & Best Practices" section pointing at `docs/solutions/` is a parallel, smaller change inside the same edit.

## Open Questions

### Resolved During Planning

- **Should the bus be exposed via React context?** No. Context adds React coupling and forces consumers to wrap things in providers. A module singleton is cleaner and matches the existing decoupled posture. The hook (`useInputAction`) wraps the singleton for ergonomics, but the singleton is the source of truth.
- **Should focus-restore require components to opt in via `data-focus-key`?** No. Adding a required attribute would re-introduce per-component coupling. Use `aria-label` (already required for accessibility) as the implicit focus key, with `id` and selector path as fallbacks. Document the trade-off: components without any of those identifiers are simply unrestored — a graceful degradation, not a crash.
- **Test the gamepad adapter as a unit (mock `navigator.getGamepads`) or only via the Playwright spec?** Both. Unit tests prove the hold/repeat state machine; the Playwright spec proves the rAF loop and event-loop wiring actually run in a browser. They cover different failure modes.

### Deferred to Implementation

- **Exact stable-key derivation for focus restore** when no `aria-label` or `id` is present. Likely a structural selector path within the route scope, but the precise format depends on what the implementer sees in real DOM trees. Capture once a real test is failing.
- **Whether to `requestAnimationFrame` or `requestIdleCallback` after route resolution** for focus restore. Both are reasonable; rAF is simpler and synchronous with paint. Use rAF unless a flake appears.
- **TanStack Router subscription API surface** — `router.subscribe('onLoad', ...)` vs `router.subscribe('onResolved', ...)` — pick whichever the installed version exposes. Verify against `node_modules/@tanstack/react-router/dist` once implementing.

## Implementation Units

- [x] **Unit 1: Module-level bus singleton + React subscription hook**

**Goal:** Make the input bus reachable from product code without window globals or prop drilling.

**Requirements:** R1.

**Dependencies:** None. Foundational for Units 3 and 4.

**Files:**
- Modify: `korri/shared/navigation/start.ts`
- Create: `korri/shared/navigation/use-input-action.ts`
- Create: `korri/shared/navigation/start.test.ts`
- Create: `korri/shared/navigation/use-input-action.test.tsx`

**Approach:**
- In `start.ts`, hold a module-level `currentHandle: SpatialNavigationHandle | null`. Set it on `startSpatialNavigation()`, clear it on `dispose()`.
- Export `getSpatialNavigation()` that returns the current handle or throws with a clear message ("startSpatialNavigation() has not been called — initialize it in your app entrypoint before reading the bus").
- Export `getInputBus()` as a convenience for the most common case.
- `useInputAction(type, handler)` is a thin React hook: on mount it subscribes via `getInputBus().onAction(type, handler)`; on unmount it disposes. Captures the latest handler in a ref so consumers don't need to memoize.
- Storybook continues to use the `window.__korriSpatialNav` pattern; the singleton coexists (set by the same `startSpatialNavigation()` call).

**Patterns to follow:**
- Existing `start.ts` already exposes `SpatialNavigationHandle`. Add the singleton alongside without changing the function signature.
- For the hook, mirror the React-conventions skill on the user's machine: use `useEffect` with explicit cleanup, capture handler in a ref to avoid stale closures.

**Test scenarios:**
- *Happy path:* `startSpatialNavigation()` makes `getSpatialNavigation()` return a non-null handle whose `bus` matches the returned handle's bus.
- *Error path:* Calling `getSpatialNavigation()` before `startSpatialNavigation()` throws with a descriptive message.
- *Edge case:* Disposing the handle clears the singleton so subsequent `getSpatialNavigation()` throws again. Re-calling `startSpatialNavigation()` after dispose installs a fresh handle.
- *Hook happy path:* `useInputAction("back", handler)` causes `bus.emit({ type: "back" })` to invoke the handler exactly once.
- *Hook cleanup:* Unmounting a component using the hook stops further invocations on subsequent emits.
- *Hook stale-closure resistance:* Re-rendering with a new handler reference makes future emits invoke the latest handler, not the original.

**Verification:**
- `just test-unit` includes new tests, all passing.
- `just typecheck` passes.
- `getInputBus()` can be imported from `@shared/navigation/start` and resolves to the live bus in both portal and storybook builds.

---

- [x] **Unit 2: Unit coverage for input bus, keyboard adapter, gamepad adapter, and focus engine**

**Goal:** Lock the behavior of the new shared modules so future changes can't silently regress them.

**Requirements:** R2.

**Dependencies:** None.

**Execution note:** Test-first where the behavior is non-obvious — particularly the gamepad hold/repeat state machine and the focus-engine direction dispatch. Existing modules already work, so this is characterization coverage rather than new behavior.

**Files:**
- Create: `korri/shared/input/bus.test.ts`
- Create: `korri/shared/input/keyboard-adapter.test.ts`
- Create: `korri/shared/input/gamepad-adapter.test.ts`
- Create: `korri/shared/navigation/focus-engine.test.ts`

**Approach:**
- Use Bun test (matches existing project patterns under `korri/shared/utils/*.test.ts`). happy-dom is already globally registered.
- Bus tests: subscription/unsubscription, `onAction` type filtering, multiple listeners, listeners can unsubscribe themselves during dispatch (the snapshot-iteration guarantee in `bus.ts`).
- Keyboard tests: dispatch a `KeyboardEvent` with a key matching each default mapping, verify the right action emits and `preventDefault` was called. Editable-element guard suppresses emission when an `<input>` has focus. Custom keymap overrides defaults.
- Gamepad tests: stub `navigator.getGamepads` with a controllable fake. Tick `rAF` manually (use `vi.useFakeTimers`-equivalent via `globalThis.requestAnimationFrame` override). Verify single press emits once, held button emits once initially, held direction emits again after `repeatDelayMs + repeatIntervalMs`, stick threshold respected, dominant-axis selection picks horizontal vs vertical correctly.
- Focus engine tests: inject a fake `nextFocus`, build a tiny DOM in happy-dom, dispatch direction actions, assert `document.activeElement` updates and `scrollIntoView` was called. Confirm action `.click()`s the active element by default. `back`/`options`/`menu` invoke the configured callbacks. `scope` is honored — focus only moves when the active element is inside scope; otherwise initial-focus runs.

**Patterns to follow:**
- `korri/shared/themes/shift/organisms/GridView.test.ts` for happy-dom DOM setup.
- `korri/shared/utils/array.test.ts` for plain Bun-test structure.

**Test scenarios:**
- *Bus happy path:* `emit` dispatches to all listeners; `on` returns a disposer that removes the listener.
- *Bus type filter:* `onAction("confirm", handler)` only fires for `confirm` actions, never for `direction` or `back`.
- *Bus self-unsubscribe:* A listener calling its own disposer mid-dispatch does not break the in-flight iteration.
- *Bus dispose:* `dispose()` removes all listeners and adapter disposers.
- *Keyboard happy path:* `ArrowUp` keydown → `{type: "direction", direction: "up"}` emitted, `preventDefault` called.
- *Keyboard editable guard:* When `document.activeElement` is an `<input>`, `ArrowUp` does not emit and `preventDefault` is not called.
- *Keyboard custom keymap:* User-supplied mapping replaces defaults, including extending `options` with `KeyO`.
- *Keyboard no-match:* Pressing an unmapped key does nothing.
- *Gamepad single press:* Pressing button 0 emits `confirm` once even if pressed for many polls.
- *Gamepad direction repeat:* Holding d-pad up emits `up` once on press, then repeats after `repeatDelayMs`, then again every `repeatIntervalMs`. Releasing resets state.
- *Gamepad stick dominant axis:* `(x: 0.8, y: 0.4)` emits `right`, not `down`.
- *Gamepad threshold:* `(x: 0.3, y: 0)` does not emit; `(x: 0.6, y: 0)` does.
- *Gamepad SSR safety:* When `navigator.getGamepads` is undefined, `start` returns a no-op disposer without throwing.
- *Engine direction:* With a fake `nextFocus` returning a target, dispatching `{type: "direction", direction: "right"}` calls `target.focus()` and `scrollIntoView`.
- *Engine confirm default:* Without `onConfirm`, dispatching `confirm` calls `.click()` on `document.activeElement`.
- *Engine confirm override:* With `onConfirm`, the override fires and `.click()` does not.
- *Engine back/options/menu:* Each callback fires exactly when the matching action dispatches.
- *Engine scope:* When `scope()` returns an element and the active element is outside it, direction triggers initial-focus inside the scope.
- *Engine no scope, no active:* When nothing is focused, direction triggers initial-focus across the document.

**Verification:**
- `just test-unit` reports the new tests passing alongside the existing 285.
- Coverage of `bus.ts`, `keyboard-adapter.ts`, `gamepad-adapter.ts`, and `focus-engine.ts` is non-zero on every exported function.

---

- [ ] **Unit 3: Wire `back` (and `menu`) actions to the router**

**Goal:** Pressing the `back` action navigates the router back. `menu` is wired to a no-op route placeholder so the pattern is established for future consumers.

**Requirements:** R3.

**Dependencies:** Unit 1 (needs `useInputAction` or `getInputBus()`).

**Files:**
- Modify: `korri/products/app/routes/+__root.tsx`
- Modify: `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` (replace the speculative `nav.bus.onAction("back", ...)` example with the real one once it exists)

**Approach:**
- In `RootComponent`, call `useInputAction("back", () => router.history.back())`. Get the router via `useRouter()` from `@tanstack/react-router`.
- Guard against navigating back from the entry route — if `router.history.canGoBack()` (or equivalent for the installed version) is false, do nothing. Surface this in a comment so future contributors don't re-add a noisy back-action handler.
- For `menu`, add a stub: `useInputAction("menu", () => { /* TODO: open global menu when one exists */ })` with a comment that no UI exists yet. Keeps the seam visible without inventing product behavior. **Alternative:** skip `menu` entirely until a real consumer exists. Pick during implementation based on whether the no-op feels useful or noisy — defer.

**Patterns to follow:**
- TanStack Router `useRouter()` access pattern, already used elsewhere in the codebase.

**Test scenarios:**
- *Happy path (manual smoke):* Navigate forward to a child route (when one exists) and press `Backspace` (the keyboard adapter's default `back` mapping). Router goes back. Pending until a second route lands; for now verify in dev tools or a log statement that the handler fires.
- *Edge case:* Pressing `back` on the root route with no history does not throw.

**Verification:**
- `just dev` and inspect that pressing `Backspace` (or `Escape`) on the home route at minimum invokes the handler (add a temporary `logger.debug` if needed during development; remove before commit).
- Component spec coverage for this is deferred until a multi-route scenario exists. Mark a follow-up in the test as a `test.skip` with a clear reason, or leave a comment in `RootComponent` pointing to the future test.

---

- [ ] **Unit 4: Focus restore across DOM remounts**

**Goal:** When the DOM mounting around the focused element re-renders (route change, Suspense resolution, modal close), focus returns to the originating element on next paint instead of falling to `<body>`.

**Requirements:** R4.

**Dependencies:** Unit 1 (singleton + hook for the router-side capture).

**Files:**
- Create: `korri/shared/navigation/focus-restore.ts`
- Create: `korri/shared/navigation/focus-restore.test.ts`
- Modify: `korri/products/app/routes/+__root.tsx`

**Approach:**
- `focus-restore.ts` exports `createFocusRestore()` returning `{ capture(scopeKey: string), restore(scopeKey: string), clear() }`.
- `capture(scopeKey)` reads `document.activeElement`, derives a stable key (`aria-label` || `id` || structural-path-from-scope-root), and stores `(scopeKey → focusKey)` in an in-memory `Map`.
- `restore(scopeKey)` looks up the saved focusKey, queries the current DOM under the scope root for a matching element, and calls `.focus()`. If no match, no-op (engine's initial-focus path will eventually handle direction input).
- Restoration runs on `requestAnimationFrame` to give the new DOM time to mount.
- In `RootComponent`, subscribe to router lifecycle: capture before navigation (`router.subscribe("onBeforeLoad", ...)`) and restore after (`router.subscribe("onResolved", ...)`). Use the route path as the `scopeKey`.
- Components do not opt in. `aria-label` is already used on `Card`/`button[aria-label]` elements; `id` is used elsewhere; structural path is the universal fallback.

**Technical design:** *(directional guidance, not implementation specification)*

```
Forward navigation:
  user presses Enter on /games card "Hades"
    → bus emits confirm
    → engine clicks the card → router.navigate("/games/hades")
    → router.onBeforeLoad fires → focusRestore.capture("/games") records "Hades"
    → /games unmounts, /games/hades mounts
    → router.onResolved fires → focusRestore.restore("/games/hades") (no entry → no-op)

Backward navigation:
  user presses Backspace on /games/hades
    → bus emits back → handler calls router.history.back()
    → router.onBeforeLoad fires → focusRestore.capture("/games/hades") records detail focus
    → /games/hades unmounts, /games re-mounts
    → router.onResolved → focusRestore.restore("/games") finds "Hades" by aria-label, focuses it
```

**Patterns to follow:**
- The engine's `isInsideScope` helper (private) for scope-aware element lookup if a scope element is needed. Otherwise plain `document.querySelector`.
- TanStack Router subscription patterns documented at `node_modules/@tanstack/react-router` (verify exact event name during implementation — `onBeforeLoad`/`onResolved` are illustrative, the Deferred-to-Implementation note covers the detail).

**Test scenarios:**
- *Happy path:* Capture an element with `aria-label="Hades"`, replace the DOM with a new tree containing a button with the same label, call `restore`, assert that button is focused.
- *Edge case (no match):* Capture an element, replace the DOM with one that has no matching label/id, call `restore`, assert no element is focused (graceful degradation).
- *Edge case (no `aria-label` or `id`):* Capture an element with neither identifier; the structural-path fallback finds it after a re-render of the same structure.
- *Edge case (timing):* Restore that runs before the new DOM mounts no-ops cleanly, and the `requestAnimationFrame` deferral picks up the mounted element.
- *Edge case (multiple captures, same scopeKey):* Last capture wins.
- *Integration:* In a full happy-dom test, mount a component with a focused button, simulate a re-render (clear and re-mount the same JSX), call `capture` then `restore`, assert focus survives.

**Verification:**
- `just test-unit` includes the new focus-restore tests, all passing.
- Manual smoke: from the home route, focus a card, simulate a forced re-render (e.g., flip a state in dev tools), confirm focus returns rather than falling to `<body>`.

---

- [ ] **Unit 5: Gamepad-driven Playwright spec with a fake-gamepad shim**

**Goal:** Prove end-to-end that the gamepad adapter's polling, hold/repeat state machine, and bus emission produce focus changes in a real browser.

**Requirements:** R5.

**Dependencies:** None (independent from Units 3 and 4).

**Files:**
- Create: `korri/shared/themes/shift/organisms/GameGrid.gamepad.story.e2e.ts`
- Optionally extract a shared helper: `tools/playwright/fake-gamepad.ts`

**Approach:**
- Use `page.addInitScript` to install a fake `navigator.getGamepads` before any app code runs. The fake returns a single Standard-layout gamepad backed by mutable button/axes arrays.
- Expose `window.__fakeGamepad = { press(buttonIndex), release(buttonIndex), setAxis(index, value) }` from the init script for in-browser test control.
- Dispatch a synthetic `gamepadconnected` event after install so `navigator.getGamepads()` returns the pad immediately.
- In the test, navigate to the GameGrid story (same one Unit 0 used). Use `page.evaluate` to call `__fakeGamepad.press(15)` (d-pad right), wait one or two animation frames, assert `document.activeElement.aria-label` changed.
- Cover: directional press moves focus (parallels the existing keyboard spec), button 0 fires confirm and clicks the focused card, holding d-pad past `repeatDelayMs` produces multiple direction events.

**Patterns to follow:**
- `korri/shared/themes/shift/organisms/GameGrid.story.e2e.ts` for the story-driven Playwright shape (`beforeEach` navigation, `focusedAriaLabel` helper, click-spy pattern).
- `page.addInitScript` for pre-app injection — Playwright's standard browser-context init mechanism.

**Test scenarios:**
- *Happy path:* `__fakeGamepad.press(15)` (d-pad right) moves focus from the first card to a different card.
- *Inverse:* Press right then left, focus returns to origin.
- *Confirm:* With a click spy installed (same pattern as the keyboard spec), `__fakeGamepad.press(0)` triggers a click on the focused card.
- *Repeat:* Hold d-pad right (no release) past `repeatDelayMs + repeatIntervalMs * 2`, assert focus moves multiple times during the hold.
- *Stick:* `setAxis(0, 0.8)` (left stick X) moves focus right.

**Verification:**
- `just test-component` runs the new spec alongside the existing keyboard spec, all green.

---

- [ ] **Unit 6: Working-agreement updates**

**Goal:** Make the navigation policy and institutional learnings discoverable from `AGENTS.md` so the next contributor follows the pattern instead of re-introducing per-component coupling.

**Requirements:** R6.

**Dependencies:** None.

**Files:**
- Modify: `AGENTS.md`

**Approach:**
- Add a "Spatial navigation" sub-section under "Implementation Patterns" with the policy:
  - Components are native HTML — no nav-library imports (`@bbc/tv-lrud-spatial`, `useFocusable`, etc.) outside `@shared/input/*` and `@shared/navigation/*`.
  - Subscribe to `back`, `menu`, `options` via `useInputAction(type, handler)` from `@shared/navigation/use-input-action`. Do not reach into `window.__korriSpatialNav`.
  - For LRUD hints (block-exits, ignore, container) use the documented CSS classes and data attributes; do not invent component APIs.
  - Link to `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`.
- Add a small "Institutional learnings" sub-section under "Product Documentation Shape" pointing at `docs/solutions/`:
  - Best-practice patterns and post-mortems live in `docs/solutions/best-practices/<topic>-YYYY-MM-DD.md`.
  - Read before introducing a new pattern in a domain that already has one documented.

**Patterns to follow:**
- Existing "Feature gates" sub-section under "Implementation Patterns" for shape, brevity, and link style.

**Test scenarios:** Test expectation: none — documentation-only change. Verification is reviewer judgment.

**Verification:**
- `just lint` and `just format` pass (Biome ignores Markdown but the just recipes should still be runnable).
- Reviewer can find the policy in under 10 seconds of skimming `AGENTS.md`.
- Reviewer can find the solutions doc from `AGENTS.md` without grepping.

## System-Wide Impact

- **Interaction graph:** Unit 1 introduces a module-level singleton — anything importing `getSpatialNavigation()` or `getInputBus()` is now coupled to `startSpatialNavigation()` having been called. Document the contract explicitly (the throw on uninitialized read makes this loud at runtime).
- **Error propagation:** Focus restore (Unit 4) and `back` handling (Unit 3) silently no-op when their preconditions aren't met (no saved focus key, no router history). Document this — it's intentional graceful degradation, not a failure mode worth surfacing to users.
- **State lifecycle risks:** Storybook continues to use `window.__korriSpatialNav` for HMR-safe disposal. Make sure `startSpatialNavigation()` continues to reset the singleton on dispose so Storybook's dispose-then-init pattern doesn't leave a stale reference.
- **API surface parity:** No external API surface changes. The only "contract" expansion is the new `useInputAction` hook and `getInputBus()` accessor — both additive.
- **Integration coverage:** Unit 4's focus-restore claim ("focus survives DOM remount") is the kind of behavior unit tests with mocked DOM can prove only weakly. The Playwright spec on the existing `GameGrid.story.e2e.ts` plus a future multi-route smoke test should ultimately cover it; for now, in-test re-renders are the proxy.
- **Unchanged invariants:** The `InputAction` type, `InputAdapter` contract, `FocusEngineOptions`, and LRUD's hint attributes (`lrud-container`, `data-block-exit`, etc.) do not change. Existing components using only native HTML continue to work without modification.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Module-level singleton in `start.ts` causes hot-reload weirdness in the portal (Vite re-evaluates the module, losing the singleton). | Storybook already proved the pattern with a `window` global. If portal HMR breaks, fall back to a `globalThis` key for the singleton too — simple, documented escape hatch. |
| TanStack Router subscription API differs from what's assumed (`onBeforeLoad`/`onResolved`). | Verify against the installed version during Unit 4. The deferred-to-implementation note covers this; the strategy is API-agnostic ("capture before navigate, restore after route resolves"). |
| Focus restore picks the wrong element when multiple have the same `aria-label`. | First-match wins is acceptable. If it becomes a real issue, escalate the fallback to include structural path even when `aria-label` exists (compound key). Defer until observed. |
| Gamepad test flakes from rAF timing in Playwright. | Use `page.waitForFunction` to poll for the expected focus state rather than fixed sleeps. The existing keyboard spec already runs in ~5s; gamepad should be similar. |
| `useInputAction` stale-closure bugs reintroduce themselves later. | Unit 1's tests explicitly cover stale-closure resistance. If a regression appears, the test will fail. |
| AGENTS.md policy gets ignored. | Policy is not enforced by tooling — relies on review. Acceptable for now; if violations recur, add a Biome rule or a tiny grep-based lint that flags `useFocusable` / `@noriginmedia` / `@bbc/tv-lrud-spatial` imports outside the allowed paths. |

## Documentation / Operational Notes

- After Unit 3 lands, update `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` so the "routes subscribe to the bus" example matches the real `useInputAction` API rather than the speculative `nav.bus.onAction(...)` form.
- After Unit 6 lands, the `AGENTS.md` policy is the canonical source for "how to do spatial navigation in this repo." The solutions doc remains the rationale and gotcha reference.
- No rollout, monitoring, or migration concerns — this is local frontend infrastructure.

## Sources & References

- Origin context: prior conversation establishing the decoupled architecture (commits `9b48db2`, `6e7dac1`, `25cae0e`, `ee54afa`).
- Compound learning: `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`.
- Related code: `korri/shared/input/*`, `korri/shared/navigation/*`, `korri/deploy/portal/main.tsx`, `korri/deploy/storybook/preview.tsx`, `korri/products/app/routes/+__root.tsx`, `korri/shared/themes/shift/organisms/GameGrid.story.e2e.ts`, `tools/playwright/playwright.component.config.ts`.
- LRUD: [@bbc/tv-lrud-spatial](https://github.com/bbc/lrud-spatial).
