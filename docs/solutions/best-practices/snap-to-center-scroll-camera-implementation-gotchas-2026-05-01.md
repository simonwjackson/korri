---
title: Snap-to-center scroll camera — implementation gotchas for opt-in scrollables
date: 2026-05-01
category: best-practices
module: korri/shared/navigation + korri/shared/primitives/components/Tilegrid
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Building a "Mario camera" style scroll surface where the focused element stays roughly centered as focus moves
  - Implementing animated scroll-to-target behavior with rAF tweens
  - Integrating focus-driven scroll behavior with a pointer-aware spatial navigation system
  - Adding edge padding to a scroll container so the first/last item can each reach the centered position
  - Tempted to listen for `focusin` on a scroll container to centre the focused descendant
related_components:
  - frontend_stimulus
  - testing_framework
tags:
  - spatial-navigation
  - scroll-centering
  - focus-management
  - requestanimationframe
  - container-queries
  - mario-camera
  - ui-motion
  - react
---

# Snap-to-center scroll camera — implementation gotchas for opt-in scrollables

## Context

Replacing `scrollIntoView({block:"nearest", inline:"nearest"})` with a Mario-platformer-style camera (focused element stays roughly centered, world scrolls behind it) sounds like a one-line change: swap `"nearest"` for `"center"`, maybe add `behavior: "smooth"`, ship it.

It is not a one-line change. The naive implementations — `scrollIntoView({inline:"center"})`, native `scroll-behavior: smooth`, a focusin listener that centers on every focus event — each fail in a way that becomes obvious only when you wire them up against a real input stack. This document captures the four non-obvious traps to avoid when implementing this pattern in any system that has both directional (keyboard/gamepad) and pointer (mouse) input feeding the same focus state.

The contract for the pattern itself — opt-in DOM attribute, focus-source matrix, edge padding via container queries — lives in `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`. This document covers the *implementation* lessons learned while building it.

## Guidance

### 1. Centering must be engine-gated, not focusin-gated

The temptation: register a `focusin` listener on the scroll container; whenever any descendant gets focus, animate the container to center that descendant. Simple, declarative, catches every focus path uniformly.

The trap: in a system where pointer hover focuses the tile under the cursor (standard pattern in TV/launcher UIs that share one focus model across mouse and gamepad), this creates a feedback loop. Hover-focus on tile #N → centering animation slides the rail under a stationary cursor → the cursor is now over tile #N+1 → hover-focus fires again → rail centers tile #N+1 → cursor is now over #N+2 → loop.

The fix: only the **focus engine's directional path** triggers centering. Pointer-hover focus calls `element.focus({ preventScroll: true })` directly, deliberately bypassing the engine. The util that computes the centered scroll position is exported as a public function, but it is invoked only from:

- The focus engine's `case "direction"` branch (animated, on every direction action including wheel-as-direction).
- The opt-in surface's own initial-focus `useEffect` (snap, on mount).
- The focus-restore module after restoring captured focus (snap, on remount).

Hover focus is never on this list. The matrix in the spatial-nav best-practice spells out every focus source and which ones do or don't trigger centering.

This rule has a counterintuitive corollary: **do not "improve" the implementation by adding a focusin listener as a "catch-all"**. It will silently re-introduce the feedback loop the moment a pointer adapter ships. Leave a comment on the surface that explains the gating, so a future contributor understands why focusin coverage is not just "missing".

### 2. Edge-padding overflow gate must compare *natural* size, not `scrollWidth` / `scrollHeight`

For tile #1 and tile #N to each reach the centered position, the scroll content needs leading and trailing space equal to `(containerSize − cellSize) / 2`. The cleanest expression is CSS: `padding-inline: max(0px, calc(50cqi - var(--cell-size) / 2))` on the inner grid, with `container-type: inline-size` on the scroll container.

But this padding should only apply when the surface actually overflows — non-overflowing surfaces should not gain spurious scroll room (otherwise short rails start scrolling on focus moves, contradicting the intended "no scroll if it all fits" rule).

The natural way to gate this is a ResizeObserver that compares "content overflows container?". The trap: reading `scrollWidth` (or `scrollHeight`) to make this decision creates a feedback loop with the padding itself.

```ts
// ❌ Recursion trap.
const observer = new ResizeObserver(() => {
  setOverflows(scrollContainer.scrollWidth > scrollContainer.clientWidth)
})
```

Sequence: padding is off → scrollWidth = N → comparison says "doesn't overflow, padding stays off" → fine. But once *anything* triggers padding on (initial measurement, font load, theme switch), the padding itself contributes to scrollWidth, so the next measurement says "yes, overflows" — and now padding stays on indefinitely even if the container grows large enough that the content would otherwise fit. The flag is sticky.

The fix: compute the **natural** content size from data the surface already knows (item count, cell size, gap, span values), and compare against the container's `clientWidth` / `clientHeight`. Both sides of the comparison are stable across the padding toggle.

```ts
// ✅ Natural size doesn't include the padding it gates.
const naturalWidth = sumSpans * cellSize + (sumSpans - 1) * gap
const update = () => {
  setOverflows(naturalWidth > 0 && naturalWidth > scrollContainer.clientWidth)
}
```

For grids where exact natural size depends on dense-packing layout (multi-row, with span items), an approximation is fine — this is an overflow gate, not a layout calculation. A small overestimate is harmless.

### 3. rAF tween: capture the scheduler at module level so injected fakes work across frames

Snappy animation (~120-180ms) requires a hand-rolled rAF tween, because native `scroll-behavior: smooth` is ~300-400ms in Chromium with no duration knob. Standard pattern:

```ts
function tween(...) {
  // ...
  if (notDone) requestAnimationFrame(tween)
}
```

This is fine in production. It breaks tests that inject a fake clock for determinism:

```ts
centerScrollableAncestors(target, {
  schedule: fakeClock.schedule,  // captured for the FIRST frame
  cancel: fakeClock.cancel,
  now: fakeClock.now,
})

// ...flush fakeClock — first frame runs...
// ...next frame is scheduled via the bare `requestAnimationFrame`
//    inside `tween`, which the fake clock cannot drive.
// Test stalls or relies on real timers, becoming flaky.
```

The fix: store the most recent caller's scheduler in module-private state and re-arm the next frame through that captured reference, not through a bare `requestAnimationFrame`:

```ts
let rafSchedule: ((cb: FrameRequestCallback) => number) | null = null
let rafCancel: ((handle: number) => void) | null = null

function start(scheduler, canceler) {
  rafSchedule = scheduler
  rafCancel = canceler
  if (rafHandle === null) rafHandle = scheduler(tick)
}

function tick() {
  // ...advance tweens...
  if (activeTweens.size > 0 && rafSchedule) {
    rafHandle = rafSchedule(tick)  // re-arm via captured scheduler
  }
}
```

This is a real bug we hit and fixed during the unit tests for `centerScrollableAncestors`. The "cancel and restart" test failed deterministically because the second tween's frames were scheduled via the test's fake clock, but mid-tween re-arms used real `requestAnimationFrame`, which the fake clock doesn't see.

### 4. Initial-focus snap requires rAF deferral, not just `useEffect`

Many opt-in scroll surfaces have a consumer that auto-focuses a specific element on mount (e.g., a "resume target" tile in a game launcher). The expectation: when the page first paints, the focus is on the resume target *and* the rail is already centered on it.

The naive implementation: in the surface's mount `useEffect`, look at `document.activeElement` and snap-center if it's a descendant.

```ts
// ❌ Runs before the consumer's focus call.
useEffect(() => {
  const active = document.activeElement
  if (active && surface.contains(active)) {
    centerScrollableAncestors(active, { animate: false })
  }
}, [])
```

This doesn't work, because **child component effects run BEFORE parent component effects in React**. The surface is the child; the consumer that calls `.focus(target)` is the parent. So at the time of the surface's mount effect, `document.activeElement === document.body` and the snap is a no-op.

The fix: defer the snap by one rAF so it runs after the consumer's mount effect.

```ts
// ✅ rAF deferral catches the consumer's post-mount .focus() call.
useEffect(() => {
  const handle = requestAnimationFrame(() => {
    const active = document.activeElement
    if (active && surface.contains(active)) {
      centerScrollableAncestors(active, { animate: false })
    }
  })
  return () => cancelAnimationFrame(handle)
}, [])
```

This is one frame of "wrong" scroll position visible to the user. Acceptable — it's a single frame, the focus is correct from the start, and the alternative (a focusin listener) re-introduces the feedback loop from gotcha #1.

A second `useLayoutEffect` keyed on the overflow flag handles the resize case (window grows/shrinks, overflow toggles, focus is in the rail) — that one is synchronous because the trigger is a layout state change, not a peer-component effect timing question.

### 5. `preventScroll: true` discipline — the engine is the sole owner

Anywhere your code calls `.focus()` and you are also explicitly managing scroll position, pass `{ preventScroll: true }`. Otherwise the browser's default focus-scroll behavior races your animation or layers over your `scrollIntoView` call.

Three call sites need this discipline in a center-on-focus system:

- **Focus engine direction branch**: `next.focus({ preventScroll: true })` then either `centerScrollableAncestors` (Mario surface) or `scrollIntoView({block:"nearest", inline:"nearest"})` (non-Mario).
- **Pointer adapter hover-focus**: `target.focus({ preventScroll: true })` so the rail doesn't slide on hover (and so the ESLint rule that says "are you sure you want to call focus() without options" passes by intention).
- **Focus restore**: `target.focus({ preventScroll: true })` followed by `centerScrollableAncestors(target, { animate: false })` so the restore lands on the centered position immediately, not at wherever the browser's default focus-scroll put it.

The engine becomes the **sole owner** of post-focus scroll behavior on opt-in surfaces. No layer fights it; no stale `scroll-behavior: smooth` setting interferes; consumer code that just wants to focus an element gets predictable, deterministic scroll positions.

## Why This Matters

These four traps each fail in different ways:

| Trap | Failure mode |
|---|---|
| focusin-gated centering | Feedback loop the moment pointer hover ships. The implementation works in keyboard-only tests, then breaks on real desktop. |
| `scrollWidth`-gated padding | Padding flag becomes sticky once it flips on. Non-overflowing surfaces gain permanent scroll room. |
| Bare `requestAnimationFrame` in tween re-arm | Tests with injected clocks become flaky once tweens cross multiple frames. |
| `useEffect`-only initial snap | First paint shows focus on the right element, but rail is at scrollLeft=0. User sees the rail jump on the first arrow press. |
| Missing `preventScroll: true` | Browser auto-scroll races the animated tween mid-flight. Animation looks janky on Chromium, fine on Safari, different again on Firefox. |

Each is a real failure that won't surface in a synthetic unit test of the centering math. They only show up when the system is wired against real input adapters and a real consumer. Documenting them up front means the next implementation in this codebase (or the next system that copies this pattern) doesn't have to rediscover them by tracing weird Storybook behavior.

The deeper lesson: **focus-driven scroll is a system-level concern, not a component-level one**. The right places to make decisions are the focus engine and the opt-in surfaces, not a focusin listener that catches everything. Treat scroll position as state owned by exactly one layer; everything else uses `preventScroll: true`.

## When to Apply

- Building a launcher / TV / kiosk UI with a Mario-camera-style scroll feel
- Adding a "scroll-to-active" pattern to any container that has both directional and pointer input
- Implementing a hand-rolled rAF tween for any animated scroll behavior
- Reviewing a PR that adds a `focusin` listener inside a scrollable container and "just centers" — pattern-match this and ask about the feedback loop

## Examples

### Engine integration (the seam between focus and scroll)

```ts
case "direction": {
  const next = nextFocus(focused, action.direction, scope)
  if (!next) return

  // preventScroll: true so the browser's default focus-scroll cannot
  // race the rAF tween (Mario surfaces) or layer over the explicit
  // scrollIntoView (non-Mario surfaces). Engine is the sole owner.
  next.focus({ preventScroll: true })

  if (hasMarioCameraAncestor(next)) {
    centerScrollableAncestors(next, { animate: true })
  } else {
    next.scrollIntoView({ block: "nearest", inline: "nearest" })
  }
  return
}
```

### Surface opt-in (Tilegrid Root)

```tsx
// Outer scroll container
<div
  data-mario-camera="inline"
  style={{
    overflowX: "auto",
    containerType: "inline-size",
    "--mario-cell-size": cellSizeCss,
  }}
>
  {/* Inner grid */}
  <div
    style={{
      paddingInline: overflows
        ? "max(0px, calc(50cqi - var(--mario-cell-size) / 2))"
        : 0,
    }}
  >
    {/* tiles */}
  </div>
</div>

// Initial-focus snap (rAF-deferred, see gotcha #4)
useEffect(() => {
  const handle = requestAnimationFrame(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement && outer.contains(active)) {
      centerScrollableAncestors(active, { animate: false })
    }
  })
  return () => cancelAnimationFrame(handle)
}, [])

// Overflow-change snap (synchronous, see gotcha #2)
useLayoutEffect(() => {
  if (!overflows) return
  const active = document.activeElement
  if (active instanceof HTMLElement && outer.contains(active)) {
    centerScrollableAncestors(active, { animate: false })
  }
}, [overflows])
```

### rAF tween scheduler capture (gotcha #3)

```ts
// Module-private state — captured from the most recent call so test
// injections survive across frame boundaries.
let rafHandle: number | null = null
let rafSchedule: ((cb: FrameRequestCallback) => number) | null = null
let rafCancel: ((handle: number) => void) | null = null

export function centerScrollableAncestors(target, options = {}) {
  // ...compute target scroll positions, store in activeTweens map...

  rafSchedule = options.schedule ?? requestAnimationFrame
  rafCancel = options.cancel ?? cancelAnimationFrame
  if (rafHandle === null) rafHandle = rafSchedule(tick)
}

function tick() {
  rafHandle = null
  // ...advance tweens, write scrollLeft/scrollTop, drop completed...

  if (activeTweens.size > 0 && rafSchedule) {
    rafHandle = rafSchedule(tick) // ← captured, not bare rAF
  } else {
    rafSchedule = null
    rafCancel = null
  }
}
```

## Related

- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — the architectural contract this implementation extends. Defines the `data-mario-camera` opt-in attribute, the focus-source matrix, and the engine-vs-pointer gating rule.
- `docs/solutions/best-practices/attached-ui-snaps-not-slides-2026-05-01.md` — sibling philosophy on the consumer side. Captions/labels that follow a focused tile should snap, not slide, for the same readability reasons that motivate the snap-on-restore behavior here.
- `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md` — pattern reference for `cqi`/`cqb` units and `container-type` declarations used in the edge-padding CSS.
- `docs/solutions/best-practices/css-length-props-with-sentinel-resolution-2026-05-01.md` — pattern reference for the `--mario-cell-size` custom property, sourced from the same sentinel-resolved length the surface uses for its grid sizing.
- `korri/shared/navigation/center-scroll.ts` — the centering util.
- `korri/shared/navigation/focus-engine.ts` — the directional-focus seam.
- `korri/shared/primitives/components/Tilegrid/TilegridRailRoot.tsx` and `TilegridScrollRoot.tsx` — the opt-in surfaces.
- `docs/plans/2026-05-01-002-feat-tilegrid-mario-camera-plan.md` — the implementation plan.
- `docs/brainstorms/2026-05-01-tilegrid-mario-camera-requirements.md` — the originating requirements.
