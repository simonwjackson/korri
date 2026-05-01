---
title: Mode-as-composition for responsive layout primitives (Tilegrid pattern)
date: 2026-05-01
last_updated: 2026-05-01
category: best-practices
module: korri/shared/design-system + react-component-architecture
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Building a flexible layout primitive that needs more than one display mode (paged vs scroll, virtualized vs not, fixed vs fluid)
  - Tempted to introduce a `mode: "A" | "B"` prop that switches which subtree renders inside one component
  - Consolidating multiple overlapping layout components that mostly do the same job
  - Designing a primitive that must stay theme- and domain-agnostic
  - Working in a codebase where the React skill mandates compound components + Provider
related_components:
  - frontend_stimulus
  - testing_framework
tags:
  - react
  - compound-components
  - layout-primitive
  - css-grid
  - mode-as-composition
  - tilegrid
  - bin-packer
  - lrud
  - storybook
  - tdd
---

# Mode-as-composition for responsive layout primitives (Tilegrid pattern)

## Context

The repo started with three overlapping grid organisms in `korri/shared/themes/shift/organisms/`:

- `GameGrid.tsx` — a thin dispatcher that took `viewMode: "grid" | "featured"` and rendered one of two completely different trees. Classic boolean-prop-controls-subtree anti-pattern.
- `FeaturedGameGrid.tsx` — a single-page hero layout (one 2×2 + tiles) hard-coupled to `GameRecord`, `getGameImageUrl`, and `useScale`. Story-only.
- `GridView.tsx` — a domain-agnostic generic grid, but with `forwardRef` + `useImperativeHandle`, baked-in `framer-motion`, and paged-only (no scroll mode). Story-only.

The plan was to consolidate them into one **flexible, performant, theme- and domain-decoupled grid primitive** that supports arbitrary integer-span items packed densely on a uniform CSS grid in both paged and continuous-scroll modes — without the boolean-prop pattern, without animation peer dependencies, and without losing spatial-navigation compatibility.

## Guidance

The shape that fell out of the constraints, codified as **Tilegrid** under `korri/shared/design-system/components/Tilegrid/`:

### 1. Two Roots, shared base context, mode-specific extensions

Each mode is a separate Root. Both publish a **base context** describing what to render (items, key/span/aria-label resolvers, cellSize, gap, columns, maxSpan). The paged Root adds a **paged extension** on top (currentPage, totalPages, next/prev/goToPage). Atoms read whichever fields they need from the same context shape. Mode selection is composition (consumer picks a Root), never a prop.

```tsx
// Same atoms work under both Roots; mode is a composition choice.
<TilegridScrollRoot items={items} cellSize={120} gap={8}>
  <TilegridCells
    renderCell={({ cellProps, item }) => (
      <button {...cellProps}><Tile item={item} /></button>
    )}
  />
</TilegridScrollRoot>

<TilegridPagedRoot items={items} cellSize={100} gap={8}>
  <TilegridCells
    renderCell={({ cellProps, item }) => (
      <button {...cellProps}><Tile item={item} /></button>
    )}
  />
  <PageControls />   {/* sibling, reads paged extension via useTilegrid() */}
</TilegridPagedRoot>
```

### 2. Cells via function-as-prop on the Cells atom, not on the Root

The atom owns the layout/accessibility prop contract (`cellProps`), and the consumer owns the actual element. The canonical path is `<button {...cellProps}>...</button>`, but consumers can spread the same props onto `motion.button`, a custom focusable element, or any other wrapper. This keeps the Root's contract minimal, lets sibling atoms compose against the same context, and gives animation libraries the DOM element they need without coupling Tilegrid to them.

### 3. CSS first, JS only where it has to be

CSS Grid's `grid-auto-flow: dense` already does first-fit packing for span-marked items. Scroll mode trusts CSS entirely — there is no JS bin-packer in the scroll Root. The JS bin-packer runs **only** in paged mode, where page boundaries must be known to chunk items into discrete sets.

```ts
// Scroll mode: render every item, let CSS pack.
<div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, ${cellSize}px)`, gridAutoFlow: "row dense" }}>
  {items.map((item) => <Cell span={item.span ?? 1} />)}
</div>

// Paged mode: bin-packer chunks into pages, render only current page.
const { pages, totalPages } = paginateItems({ items, columns, rows })
const visible = pages[currentPage] ?? []
```

### 4. Animation lives in the consumer

The primitive bakes in no motion library. Consumers wrap their cell visual in `motion.div` (or anything else) themselves. No peer dependency, no `transition: "fade" | "slide"` prop forcing every consumer to inherit the primitive's pick.

### 5. Test-only escape hatches with an underscore prefix

ResizeObserver and `getBoundingClientRect()` are unreliable in `happy-dom`. Rather than mocking them everywhere, the Roots accept optional `_testColumns` / `_testRows` props that bypass measurement. The underscore prefix signals "internal — do not use in production code." Document them as test-only in JSDoc.

```tsx
// In tests:
<TilegridPagedRoot items={items} cellSize={100} gap={0} _testColumns={4} _testRows={3}>
```

### 6. Verify the focus engine is geometric before relying on `dense` packing

CSS `grid-auto-flow: dense` reorders items visually relative to source order. If a spatial-nav engine resolves "next focusable" by DOM order, dense packing breaks arrow-key navigation. **Before adopting dense, verify the engine is geometric** — i.e., resolves by bounding-rect position. In this codebase, `@bbc/tv-lrud-spatial` is geometric (verified in `korri/shared/navigation/start.ts`), so dense packing is safe for both keyboard and gamepad input. See also: `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`.

### 7. Span clamping centralized in context, applied in atoms

Roots compute and publish `maxSpan: { columns, rows }` on the base context (scroll uses `{ columns, rows: Infinity }`; paged uses the derived row count). The atom calls `clampSpan(rawSpan, maxSpan)` before applying `gridColumn: span N` styles. This prevents any consumer from rendering a span that breaks the grid, without scattering clamp logic across atoms.

### 8. Defer atoms until a real consumer validates their shape

The plan called for `TilegridPagedControls` and `TilegridPageIndicator` reusable atoms. With no day-one paged consumer, these would be designed against a hypothetical UI. Ship the Root + context API; let the first paged consumer author its own controls inline. Extract atoms only after a real shape emerges. (See: document-review finding 2 in the brainstorm.)

## Why This Matters

- **Boolean props create combinatorial state spaces.** `mode: "paged" | "scroll"` plus a future `mode: "virtualized"` becomes three branches inside one component. Two Roots stay readable; three Roots stay readable; a Root per mode scales linearly with no internal conditional sprawl.
- **New modes drop in behind the same context.** A future `TilegridVirtualScrollRoot` is one new file; `TilegridCells` works under it unchanged. There's no refactor to an existing component.
- **CSS-first scroll mode is faster and smaller.** Letting the browser do dense packing eliminates a layout pass in JS, a state update, and a code path that has to be tested. The JS bin-packer remains for paged mode where it earns its keep.
- **Animation in the consumer keeps the primitive light.** No `framer-motion` import in the primitive means Tilegrid ships in any project, motion-preference handling stays the consumer's concern, and removing animation later is delete-don't-untangle. The `renderCell`, Root `asChild`, and `getViewTransitionName` seams give consumers the hooks they need without an animation prop forest.
- **The test-only escape hatch is honest.** `_testColumns` is more honest than mocking ResizeObserver globally and is cheaper than test-rendering inside a virtual-DOM viewport. The underscore prefix prevents the prop from accidentally becoming part of the production contract.
- **Verifying geometric focus before adopting `dense` is a pattern, not a one-off.** Any time a future layout primitive uses CSS reordering (`flex-direction: row-reverse`, `order:`, `dense`, masonry), this same verification applies.

## When to Apply

- You have two or more components that differ only by a `mode`/`viewMode`/`variant` prop and the boolean controls which subtree renders.
- You're building a layout primitive where the data shape is stable but display strategy varies (paged ↔ scroll, virtualized ↔ not, fixed ↔ fluid).
- A consumer wants to compose siblings of the layout (controls, indicators, overlays) that need to read primitive state — a Root + context API gives them that for free; a `renderControls` prop forest doesn't.
- You're consolidating multiple overlapping layout components that share most of their job.

## Examples

### Anti-pattern: boolean dispatcher

```tsx
// Before — viewMode controls which subtree renders inside one component.
export function GameGrid({ games, viewMode }: GameGridProps) {
  if (viewMode === "featured") {
    return (
      <div className="flex flex-1 ...">
        <FeaturedGameGrid games={games} />  // entirely different tree
      </div>
    )
  }
  return (
    <div className="flex-1 overflow-y-auto p-1">
      <div className="grid grid-cols-3 gap-2 ...">
        {games.map((g) => <Card ... />)}    // entirely different tree
      </div>
    </div>
  )
}

// Consumer:
<GameGrid games={games} viewMode="grid" />
<GameGrid games={games} viewMode="featured" />
```

### Pattern: mode-as-composition

```tsx
// After — two Roots share the base context; cells atom is mode-agnostic.
export function HomePage() {
  return (
    <TilegridScrollRoot<GameRecord> items={games} cellSize={140} gap={8}
      getKey={(g) => g.id}
      getAriaLabel={(g) => g.metadata?.name ?? g.id}>
      <TilegridCells<GameRecord>
        renderCell={({ cellProps, item }) => (
          <button {...cellProps}><GameTileVisual game={item} /></button>
        )}
      />
    </TilegridScrollRoot>
  )
}

// Hero layout? Same Root, same atoms, just data:
const itemsWithHero = games.map((g, i) => i === 0 ? { ...g, span: 2 } : g)

// Paged variant? Different Root, same children:
<TilegridPagedRoot<GameRecord> items={games} cellSize={100} gap={8}>
  <TilegridCells<GameRecord>
    renderCell={({ cellProps, item }) => (
      <button {...cellProps}><GameTileVisual game={item} /></button>
    )}
  />
  <PageControls />   // siblings reach paged context via useTilegrid()
</TilegridPagedRoot>
```

### Shared context contract

```ts
export interface TilegridBaseContext<T extends GridItemShape> {
  readonly items: ReadonlyArray<T>
  readonly getKey: (item: T) => string
  readonly getSpan: (item: T) => number
  readonly getAriaLabel: (item: T) => string
  readonly getViewTransitionName?: (item: T) => string
  readonly cellSize: number
  readonly gap: number
  readonly columns: number
  readonly maxSpan: { columns: number; rows: number }   // scroll: rows = Infinity
}

export interface TilegridPagedExtension {
  readonly currentPage: number
  readonly totalPages: number
  readonly next: () => void
  readonly prev: () => void
  readonly goToPage: (page: number) => void
}
```

### Characterization-first when porting layout math

The bin-packer was lifted verbatim from `grid-view-pagination.ts`. The execution discipline:

1. Port the test file to the new path (importing from the new module).
2. Verify tests fail against an empty stub (`SyntaxError: Export named 'paginateItems' not found`).
3. Paste the body. Verify all tests pass.
4. Only then delete the original.

This is the strongest regression guard available for porting tested pure-math modules.

### Generics don't survive React's context

React's `createContext` is invariant in its value type. To carry a generic item type through context, the runtime stores `TilegridBaseContext<GridItemShape>` and the `useTilegrid<T>()` hook re-asserts the generic on read with `as unknown as ...`. This is a pragmatic cast, not a type hole — it just acknowledges that the hook caller is responsible for picking `T` compatibly with how the Root was instantiated. Document the cast clearly.

## Animation seams (added 2026-05-01)

Decouple animation through **structural slots**, not animation props. Tilegrid should never grow `transition="fade"`, `animationDuration`, or a direct motion-library import. Instead, consumers choose the element at each structural point and bring whatever animation system they want.

### Cell wrapper via `renderCell`

`TilegridCells` passes a complete `cellProps` bag to the consumer. Spread it onto the actual cell element. A plain consumer uses a native button; an animated consumer can use a motion component without Tilegrid importing that library.

```tsx
<TilegridCells
  renderCell={({ cellProps, item }) => (
    <motion.button {...cellProps} layout>
      <TileVisual item={item} />
    </motion.button>
  )}
/>
```

### Grid container via Root `asChild`

Both Roots accept `asChild` to slot the inner grid container. The outer measurement/scroll wrapper stays owned by Tilegrid; the consumer-provided child receives the grid styles.

```tsx
<TilegridScrollRoot items={items} cellSize={120} gap={8} asChild>
  <motion.div layout>
    <TilegridCells renderCell={renderCell} />
  </motion.div>
</TilegridScrollRoot>
```

### Browser View Transitions via `getViewTransitionName`

Roots accept `getViewTransitionName={(item) => ...}` and cells apply the returned name to their inline style. Tilegrid does not call `document.startViewTransition`; the consumer wraps the data update because it owns when animation should happen. This is especially attractive for Electrobun/Chromium targets.

```tsx
<TilegridScrollRoot
  items={items}
  cellSize={120}
  gap={8}
  getViewTransitionName={(item) => `tile-${item.id}`}
>
  <TilegridCells renderCell={renderCell} />
</TilegridScrollRoot>
```

## Related

- `~/.pi/packages/react/skills/react/SKILL.md` — the in-repo React skill that codifies compound components, Provider-driven data strategy, and the no-boolean-controls-subtree rule. The Tilegrid pattern is a textbook application.
- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — geometric LRUD focus engine that makes CSS dense packing safe for spatial nav.
- `docs/brainstorms/2026-04-30-grid-primitive-consolidation-requirements.md` — origin requirements doc.
- `docs/plans/2026-04-30-005-refactor-tilegrid-primitive-consolidation-plan.md` — implementation plan with all six units.
- `docs/plans/2026-04-30-007-feat-tilegrid-animation-seams-plan.md` — follow-up plan that added `renderCell`, Root `asChild`, and `getViewTransitionName` animation seams.
- Tilegrid file family: `korri/shared/design-system/components/Tilegrid/`
