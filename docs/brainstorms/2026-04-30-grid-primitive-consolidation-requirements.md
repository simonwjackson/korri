---
date: 2026-04-30
topic: grid-primitive-consolidation
---

# Grid Primitive Consolidation

## Problem Frame

Three overlapping grid components live in `korri/shared/themes/shift/organisms/`:

- `GameGrid.tsx` — a `viewMode`-switched dispatcher that branches between a plain responsive grid and a featured layout. Uses the boolean-prop-controls-subtree pattern this repo's React skill explicitly forbids.
- `FeaturedGameGrid.tsx` — a single-page hero layout (one 2×2 tile + tiles) hard-coupled to `GameRecord`, `getGameImageUrl`, and `useScale`.
- `GridView.tsx` — a generic, paged, span-aware, animated grid with a `forwardRef` imperative `next`/`prev` API. Domain-agnostic but only used in Storybook.

There is no production app yet. `FeaturedGameGrid` and `GridView` are story-only; the route uses `GameGrid` in plain-grid mode. Carrying cost is the only constraint that matters here — there is no production behavior to preserve.

We want one flexible, performant, theme- and domain-decoupled grid primitive that supports arbitrary span-marked items packed naturally around the rest of the content, in both paged and continuous-scroll modes.

## Requirements

**Layout and packing**

- R1. The primitive lays out items in a uniform-cell CSS grid where each cell is one base size unit.
- R2. Each item may declare an integer `span` (default 1). Spanned items occupy `span × span` cells; the remaining single-cell items pack densely around them.
- R3. The primitive measures its own container and derives column count from container width and configured cell size; it does not depend on Tailwind breakpoints or any parent-supplied dimensions beyond the container itself.
- R4. Items render as native `<button>` elements in the live DOM with an accessible label, so the existing spatial-navigation focus engine works without any per-component coupling (no `useFocusable`, no refs, no provider wiring inside cells).

**Modes**

- R5. The primitive exposes two sibling Roots that share a common base context (items, cell config, span resolver, key resolver, and the cell-render seam) and add mode-specific extensions on top. One Root drives paged layout, the other continuous scroll. Per the project React skill, mode is selected by composition (different Root, same children where possible), not by a prop on a single component.
- R6. The paged Root extends the base context with `currentPage`, `totalPages`, and `next` / `prev` / `goToPage`, so sibling atoms (controls, indicator) read and drive paging without prop drilling.
- R7. The scroll Root adds no extensions to the base context; layout is delegated to CSS `grid-auto-flow: dense` over the full item list.
- R8. Page boundaries in paged mode are computed by a JS bin-packer that respects spans; an item that does not fit the remaining cells on the current page starts a new page.
- R8a. Span values are clamped per mode before layout: in paged mode, to `min(columns, rows)`; in scroll mode, to `columns`. A `span` larger than the clamp is rendered as the clamped size.
- R8b. Paged mode defaults to **stop-at-edge** focus behavior: when the spatial-nav engine asks for a next focusable past the last cell of a page (or before the first cell), no focus change occurs. Page changes are driven explicitly by `next` / `prev` / `goToPage`. The paged Root accepts an optional `boundaryBehavior?: "stop" | "advance"` knob; `"advance"` auto-advances the page and lands focus on the first/last cell of the new page when the engine pushes past the edge.

**Composition surface**

- R9. Cell visuals are supplied by the consumer via a `render(item) => ReactNode` function passed to a `GridCells` atom (function-as-prop on the atom, not a `renderItem` prop on the Root). This keeps the Root contract free of view concerns.
- R10. Paged-mode controls and page indicator are deferred. The paged Root ships with the context API (`currentPage`, `totalPages`, `next`, `prev`, `goToPage`) so consumers can author their own controls. Reusable `GridPagedControls` / `GridPageIndicator` atoms are added later, after a real consumer validates the shape.
- R11. The primitive accepts arbitrary item types via generics; nothing in the contract names or assumes any domain entity (no `GameRecord`, no `getGameImageUrl`, no `useScale`).

**Animation**

- R12. The primitive does not bake in any animation library. Consumers wrap their cell visual in motion components themselves if they want entrance/exit or hover animations. No `framer-motion` peer dependency.

**Placement and replacement**

- R13. The primitive lives outside `korri/shared/themes/`, in a theme-agnostic location under `korri/shared/` (per the AGENTS.md rule that shared runtime code lives in `korri/shared/*`).
- R14. After consolidation, `FeaturedGameGrid.tsx`, `featured-grid-pagination.ts`, `featured-grid-pagination.test.ts`, `GameGrid.tsx`, `GameGrid.stories.tsx`, `FeaturedGameGrid.stories.tsx`, and `GridView.tsx` (along with `GridView.stories.tsx`, `GridView.test.ts`) are removed.
- R15. The `ViewMode` type in `korri/shared/themes/shift/fixtures/nav.ts` and any other orphaned types are removed.
- R16. The route at `korri/products/app/routes/+index.tsx` composes the new primitive directly with a game-aware tile, or via a thin app-side composition root if a future second route needs the same tile. No `viewMode` prop survives anywhere.
- R17. The existing spatial-navigation Playwright spec (`GameGrid.story.e2e.ts`) is retargeted to a story of the new primitive (or a thin composition story) and continues to assert that arrow keys move focus across native `<button aria-label>` cells and Enter fires a click.

## Success Criteria

- One file family under `korri/shared/` replaces the three current organisms; no domain symbols are imported by the primitive.
- The home route renders with the new primitive and looks substantively the same as the current `viewMode="grid"` page (uniform cover-art tiles, no animation expected, no regression in the spatial-navigation E2E).
- A Storybook story exercises both Roots (paged + scroll) using a generic fixture (`{ id, image, span }`), with at least one story containing a `span: 2` item to demonstrate hero packing.
- Adding a new mode later (e.g., a virtualized scroll Root for the upper end of the low-thousands item range) is a new file behind the same context contract, not a refactor of any existing file.
- The repo's React skill check (no boolean-prop-controls-subtree, one component per file, no barrel files, atoms read state via context, Root owns state) passes for the new file family.

## Scope Boundaries

- No virtualization in this round. Low-thousands item counts are the worst case; paged mode handles this trivially, and scroll mode at the upper end will be acceptable. Virtualization is a future Root behind the same contract.
- No animation library, transitions, or motion primitives in the primitive. Consumers add motion at the cell level if they want it.
- No theming, tokens, or visual styling beyond layout-affecting CSS. Cells are styled by the consumer-supplied `render(item)`.
- No empty / loading / error states inside the primitive. The consumer controls the `items` array and renders zero-state, skeleton, or error UI as a sibling of (or in place of) the grid.
- No drag-and-drop, no selection model, no multi-select, no keyboard-shortcut bindings beyond what spatial nav already provides at the document level.
- No replacement for the `useScale` cell-sizing feature inside the primitive. Cell size is a plain configuration value; if the app wants a "scale preset" UX, that is a separate consumer concern that passes a number in.
- No new path aliases. Imports use existing `@shared/*` and product aliases per AGENTS.md.

## Key Decisions

- **One primitive, two Roots, shared context.** Mode is a composition choice, not a prop. Rationale: the project React skill is explicit that booleans must not switch subtrees, and paged vs scroll trees diverge in controls, indicator, and ARIA semantics — exactly the case the skill targets.
- **Bin-packer kept for paged mode only; scroll mode trusts CSS `grid-auto-flow: dense`.** Rationale: scroll mode does not need to know page boundaries, so the existing JS packing math is unnecessary work and a bug surface; CSS handles dense packing natively. Paged mode genuinely needs the JS packer because it must chunk items into discrete page sets.
- **Cell render is a function child of the `GridCells` atom, not a Root prop.** Rationale: keeps the Root contract free of view concerns and matches the React skill's Root-owns-state / atoms-own-rendering split. Consumers compose only the atoms they need; controls and indicators are siblings, not props.
- **Animation is fully outside the primitive.** Rationale: matches the user's stated "decoupled animation, not a deal-breaker" preference, removes the framer-motion peer dep, and lets each consumer pick its own motion library or skip motion entirely.
- **Paged mode defaults to stop-at-edge focus.** Rationale: matches the TV/console flavor of the rest of the stack (gamepad input, LRUD, scale presets); page changes are an explicit user gesture rather than an accidental side effect of arrow-key spam. The `boundaryBehavior` knob keeps the keyboard-friendly auto-advance available for consumers that want it.
- **Paged-mode atoms are deferred until a real consumer exists.** Rationale: with no day-one paged consumer, atom shapes would be designed against a hypothetical UI. The Root + context is the durable surface; atoms are trivially additive later behind the same contract.
- **Featured/hero is just `span: 2` data, not a separate concept.** Rationale: `FeaturedGameGrid`'s entire job is "first item gets a 2×2 tile" — that's data, not a component. Subsumed by R2.
- **Container-measured sizing, not Tailwind breakpoints.** Rationale: makes the primitive work inside any parent (sidebars, dialogs, split panes) without consumer-side breakpoint plumbing, supporting "decoupled from app".

## Dependencies / Assumptions

- The repo's spatial-navigation focus engine reads the live DOM and does not require per-component wiring; this is verified by `GameGrid.story.e2e.ts` and the comment in `GridView.tsx`'s `GridItemTile` ("Spatial navigation is handled by the global focus engine reading the live DOM — no useFocusable, no refs, no provider here").
- The focus engine uses `@bbc/tv-lrud-spatial`'s `getNextFocus` (verified in `korri/shared/navigation/start.ts`), which selects the next focusable by bounding-rect geometry — not DOM order. This makes scroll mode's CSS `grid-auto-flow: dense` safe for spatial navigation: visually adjacent cells are focus-adjacent regardless of where they sit in source order.
- Scroll-mode performance at the upper end of the low-thousands range (≈3k–5k visible `<button>` cells) is acceptable on desktop but may be heavy on TV-class hardware. A virtualized scroll Root behind the same base context is the planned future answer if this surfaces in practice.
- `korri/shared/design-system/` already exists in the repo as a shared, theme-agnostic location. Final placement (`korri/shared/design-system/Grid/` vs another subdirectory) is a planning detail.
- The existing pure pagination math in `korri/shared/themes/shift/organisms/grid-view-pagination.ts` and its test file are reusable as the bin-packer for paged mode. The featured-specific math in `featured-grid-pagination.ts` is not reusable and is removed.
- No production consumer constrains the rename or relocation; the only runtime consumer is the home route (verified: `korri/products/app/routes/+index.tsx`).

## Outstanding Questions

### Resolve Before Planning

(none)

### Deferred to Planning

- [Affects R3, R7][Technical] Exact cell-sizing knob: a single `cellSize: number` (px) vs `{ minSize, maxSize, scale }` vs container-fraction-based sizing. The right shape depends on whether the app's "scale preset" UX (currently in `ScaleProvider`) lives at the consumer or is folded into the primitive's sizing config.
- [Affects R8][Technical] Whether the bin-packer for paged mode reuses `grid-view-pagination.ts`'s existing math as-is, lifts it into the new file family, or is rewritten for clarity. The math is already tested.
- [Affects R5, R9][Technical] Final naming for the file family (`Grid` vs `GridView` vs `Tilegrid`) and the cell atom name (`GridCells` is a working name).
- [Affects R13][Technical] Final placement under `korri/shared/` — `design-system/Grid/`, `components/grid/`, or another conventional location based on what already exists.
- [Affects R17][Technical] Whether the spatial-nav E2E spec retargets to a generic primitive story or to a small game-composition story; depends on whether a `GameGrid` composition root survives in the app or the route assembles the primitive directly.

## Next Steps

-> `/ce:plan` for structured implementation planning
