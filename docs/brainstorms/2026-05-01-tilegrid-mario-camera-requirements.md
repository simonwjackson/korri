---
date: 2026-05-01
topic: tilegrid-mario-camera
---

# Tilegrid Mario-Camera Scrolling

## Problem Frame

Tilegrids that overflow their scroll container today rely on the global focus engine's edge-trigger scroll:

```ts
// korri/shared/navigation/focus-engine.ts
next.scrollIntoView({ block: "nearest", inline: "nearest" })
```

`"nearest"` is an **edge-trigger camera**: the rail does not move at all while the focused tile is fully visible, then snaps the new focus flush with the leading edge as soon as it would otherwise clip. Because Sunlit-style tiles occupy roughly half the rail's visible width, that snap shifts content by about half a rail every time focus crosses the edge — a jarring, lurching feel.

The rail also has a downstream consumer: in the Sunlit exploration (`korri/shared/design-system/explorations/home-screens/HomeSunlit.stories.tsx`), the caption tracks the focused tile's x-position via `translateX(captionX)`. With edge-trigger scrolling, the focused tile's x-position varies depending on where in the rail focus lands, which means a long game title can have very little room to extend before hitting the rail's right edge.

The desired model is the **Mario platformer camera**: the active item stays roughly in the middle of the viewport, and the world scrolls behind it. Predictable position for the focused tile means a predictable layout box for any UI that tracks it.

## Requirements

**Scope and trigger**

- R1. The Mario-camera behavior applies to every Tilegrid Root that scrolls because its content overflows its scroll container — currently `TilegridRailRoot` and `TilegridScrollRoot`. Paged Roots (`TilegridPagedRoot`) are out of scope; they do not scroll continuously.
- R2. The behavior triggers on every focus move into a tile within an overflowing tilegrid — including directional moves from the focus engine, mouse-hover focus, restored focus, and initial focus on mount.
- R3. Tilegrids whose content does not overflow (every tile is already visible) do not scroll on focus moves. The tiles' resting layout in that case may shift compared to today; see R8.

**Centering on the overflowing axis**

- R4. When a tile is focused inside an overflowing tilegrid, the scroll container scrolls so the focused tile's center aligns with the scroll container's center on the overflowing axis.
- R5. Centering applies independently per axis. A horizontally-overflowing rail centers the focused tile horizontally only; a vertically-overflowing grid centers the focused row vertically only; a tilegrid that overflows on both axes centers on both.
- R6. The focused tile's position on a non-overflowing axis is not changed by this behavior. A vertical grid that fits horizontally does not horizontally re-position the focused tile.
- R7. Item #1 and item #N must be reachable as centered focuses. The focused tile lands at the same position regardless of whether it sits at the start, middle, or end of the tilegrid.
- R8. To make R7 possible, the scroll content reserves leading/trailing space on each overflowing axis equal to half the available scroll-container size minus half a cell. As a side effect, non-overflowing tilegrids visually appear centered (rather than start-aligned) within their container. This is acceptable.
- R9. A tile whose own size exceeds the scroll container on an axis (e.g. a wide span feature tile) cannot be perfectly centered. In that case the scroll position clamps to the nearest valid scroll position; no over-scrolling is forced.

**Animation**

- R10. Scroll changes are animated, not instant. The animation feels snappy: roughly 120–180ms with an ease-out curve. The exact duration/curve is a planning detail, but native `scroll-behavior: smooth` (≈300–400ms in Chromium) is too slow and is not acceptable as the implementation.
- R11. If a new focus move arrives while a scroll animation is in flight, the in-flight animation is cancelled and a new animation starts from the current scroll position toward the new target. There is no queueing.
- R12. When the user has `prefers-reduced-motion: reduce`, the animation is skipped and the scroll snaps to the new centered position.
- R13. Initial focus on mount centers without animation. The user should not see the rail "swing into place" on first paint.

**Compatibility with other input**

- R14. Native scroll affordances on the scroll container continue to work: mouse wheel, trackpad, drag-scroll on touch, and scrollbars (where present) all continue to scroll the container manually. The Mario-camera behavior is layered on top of focus moves, not a replacement for native scroll.
- R15. The change is contained to overflowing tilegrid Roots and the focus engine's scroll behavior. Non-tilegrid scrollable containers in the app (long pages, dialogs, etc.) keep today's `nearest` behavior.

## Visual: Edge-Trigger vs Mario Camera

```
EDGE-TRIGGER (today)                    MARIO CAMERA (desired)

┌──────────── viewport ────────────┐   ┌──────────── viewport ────────────┐
│ [F][ ][ ][ ][ ][ ][ ][ ][ ]      │   │       [ ][ ][F][ ][ ][ ]         │
│  ▲ focus #1 — flush left          │   │            ▲ focus #3 — centered │
└───────────────────────────────────┘   └───────────────────────────────────┘
 . . . focus #1 → focus #4 . . .          . . . focus #3 → focus #4 . . .
┌───────────────────────────────────┐   ┌───────────────────────────────────┐
│ [ ][ ][ ][F][ ][ ][ ][ ][ ]       │   │       [ ][ ][ ][F][ ][ ]         │
│           ▲ no shift — still in   │   │             ▲ camera moved      │
│             viewport              │   │               one tile right     │
└───────────────────────────────────┘   └───────────────────────────────────┘
 . . . focus #4 → focus #5 . . .
┌───────────────────────────────────┐
│ [ ][ ][ ][ ][F][ ][ ][ ][ ]       │
│              ▲ JARRING SNAP — half-rail shift
└───────────────────────────────────┘
```

Edge-trigger only moves when the focused tile would clip. Mario camera moves a constant amount per focus step, so the focused tile's x-position is constant across the whole rail.

## Visual: Edge Padding

```
SCROLL CONTAINER (rail)                   <-- container width W -->
┌────────────────────────────────────────────────────────────────────┐
│            ┌──────────┬──────────┬──────────┬──────────┐           │
│   ◀──P──▶  │  tile 1  │  tile 2  │  tile 3  │  tile N  │  ◀──P──▶  │
│            └──────────┴──────────┴──────────┴──────────┘           │
└────────────────────────────────────────────────────────────────────┘
              ◀── cellSize C ──▶

P = (W − C) / 2     ←  leading and trailing padding inside the scroll
                       content lets tile 1 and tile N each scroll until
                       their center hits W/2.
```

When tile 1 is focused, the scroll container scrolls so the leading P sits to the left of the viewport's left edge. When tile N is focused, the trailing P sits to the right of the viewport's right edge.

## Success Criteria

- A focused tile in an overflowing rail lands at the same horizontal x-position regardless of its index (tile 1, middle tiles, and tile N all center).
- A focused tile in an overflowing vertical grid lands at the same vertical y-position regardless of its row.
- The Sunlit caption's `captionX` becomes effectively constant across all focus changes within the rail.
- Holding a directional key on a long rail produces a smooth, continuous-feeling scroll without visible mid-animation snaps when re-targets arrive.
- `prefers-reduced-motion: reduce` users see instantaneous scroll-to-center, no animated movement.
- Mouse wheel / trackpad / drag scroll on the scroll container still works.
- Non-tilegrid scrollable surfaces in the app are visually unaffected.

## Non-Goals

- **Look-ahead camera offset.** Real Mario nudges the camera ahead of the player in the direction of travel. We are not doing that here.
- **Deadzone / soft-zone centering.** A rectangular zone where the camera doesn't move was considered (option C in brainstorm) and rejected because it reintroduces caption-position variance.
- **Smooth tracking of held-input through interpolation.** Each focus move is a discrete snap-to-center with a short animation. We are not building a frame-by-frame lerp that follows continuous input.
- **Changes to `TilegridPagedRoot`.** Paged layouts page rather than scroll continuously; their alignment model is separate.
- **Changing the global `scrollIntoView` semantics for non-tilegrid scrollable surfaces.**
- **Touch-fling / momentum tweaks** on rails. Native overflow-scroll inertia is unchanged.

## Open Planning Questions

These are implementation choices to resolve during `/ce-plan`, not product decisions:

- **Where the scroll-tween utility lives.** A new helper under `korri/shared/navigation/` (peer of `focus-engine.ts`) versus inside the design-system Tilegrid module. The engine needs to call into it; the Roots may want to call into it for initial-focus centering on mount.
- **How the engine identifies "this scrollable is a Mario-camera surface".** Options: a `data-mario-camera` attribute the Tilegrid Roots set; walking up to find a Tilegrid Provider; or unconditionally centering on every directional move and relying on each surface's edge-padding to opt in. Trade-offs around blast radius and discoverability.
- **Multi-ancestor scroll handling.** When a focused tile sits inside two nested overflowing scroll containers, do we animate both in one pass, only the innermost, or only the outermost. Pick a clear policy with a default.
- **Edge-padding implementation.** CSS `padding-inline: calc(50% − cellSize/2)` on the inner grid container is the obvious shape, but the existing rail uses `width: fit-content` and a `gridAutoColumns` layout — needs verification that adding scroll-content padding interacts cleanly with `justifyContent: start` and the existing CSS-length sentinel resolution.
- **Test surface.** `TilegridRailRoot.test.tsx` and `TilegridScrollRoot.test.tsx` exist and will need updates for the new resting position of focused tiles and the new edge-padding layout. The focus-engine tests stub `scrollIntoView`; they will need a stub for whatever replaces it.
- **Interaction with the in-flight pointer-aware spatial navigation work** (`docs/brainstorms/2026-05-01-pointer-aware-spatial-navigation-requirements.md`). Hover-driven focus should use the same Mario-camera scroll path as directional focus; verify ordering between the two brainstorms during planning.
