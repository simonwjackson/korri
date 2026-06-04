---
title: "refactor: Consolidate three grid organisms into a Tilegrid primitive"
type: refactor
status: active
date: 2026-04-30
origin: ./requirements.md
---

<!-- File renumbered from 004 to 005 to avoid collision with ../.archive/01KQDTYV05D4Q8T63WBQSHD6A1-feat-electrobun-desktop-wrapper/plan.md. -->

# refactor: Consolidate three grid organisms into a Tilegrid primitive

## Overview

Replace `GameGrid`, `FeaturedGameGrid`, and `GridView` (all in `korri/shared/themes/shift/organisms/`) with a single domain- and theme-agnostic primitive named **Tilegrid**, living in `korri/shared/design-system/components/Tilegrid/`. The new primitive supports arbitrary integer-span items packed densely on a uniform CSS grid in two compositions: a `TilegridScrollRoot` (continuous scroll, layout via CSS `grid-auto-flow: dense`) and a `TilegridPagedRoot` (paged, layout via a JS bin-packer ported from the existing `grid-view-pagination.ts`). Both Roots share a base context, with the paged Root extending it with page-state. Cell visuals are supplied by the consumer via a function child of a `TilegridCells` atom; the primitive imports no domain types and bakes in no animation library.

The home route at `korri/products/app/routes/+index.tsx` migrates from `GameGrid` to `TilegridScrollRoot` with an inline game-aware tile, eliminating the `viewMode` boolean-prop-controls-subtree pattern. Two existing spatial-nav Playwright specs retarget at the new primitive's scroll story; the LRUD focus engine is geometric, so CSS dense packing is safe for keyboard and gamepad input alike (verified in origin doc Dependencies/Assumptions).

## Problem Frame

There is no production app yet, so carrying cost is the only constraint that matters. Today three grid organisms overlap: `GameGrid` is a `viewMode`-switched dispatcher (the exact boolean-prop pattern this repo's React skill forbids); `FeaturedGameGrid` is a story-only single-page hero layout coupled to `GameRecord` and `useScale`; `GridView` is a domain-agnostic paged primitive used only in Storybook with `forwardRef` + framer-motion baked in. Consolidating them now produces one well-shaped, flexible primitive and removes ~488 lines plus their stories, tests, and orphaned types. (See origin: `./requirements.md`.)

## Requirements Trace

The brainstorm captures 17 numbered requirements (R1–R17) plus R8a (span clamping) and R8b (paged-mode boundary behavior) added during document-review. This plan satisfies all of them:

- **R1, R2, R8, R8a** → Unit 1 (bin-packer port + clamp utility) and Unit 2 (`TilegridCells` applies `gridColumn: span N; gridRow: span N` per item, clamped before render)
- **R3** → Units 2 and 3 (Roots use `useContainerSize` to derive column count from container width and configured `cellSize`)
- **R4** → Unit 2 (`TilegridCells` renders native `<button aria-label>` cells, no `useFocusable`, no refs)
- **R5, R6, R7** → Units 1 (shared base context), 2 (`TilegridScrollRoot` adds nothing), 3 (`TilegridPagedRoot` extends with paging state)
- **R8b** → Unit 3 (default stop-at-edge focus is automatic from DOM scope; the optional `boundaryBehavior` knob is deferred with the atoms — see Key Decisions)
- **R9** → Unit 2 (`TilegridCells` accepts `render(item) => ReactNode` as a function child)
- **R10** → Deferred per accepted document-review finding; Unit 3 ships only the Root + context surface
- **R11** → Verified in Unit 1 (context contract is generic over `T`)
- **R12** → No framer-motion or other motion peer dependency anywhere in the new file family (cross-cutting verification at the end of Unit 3)
- **R13** → All new files live under `korri/shared/design-system/components/Tilegrid/`
- **R14, R15** → Unit 6 (deletes)
- **R16** → Unit 4 (route migration; no `viewMode` survives)
- **R17** → Unit 5 (retargets both keyboard and gamepad E2E specs)

## Scope Boundaries

- No virtualization. Low-thousands item counts are the worst case; scroll mode at the upper end will be acceptable on desktop and is a known risk on TV-class hardware. A virtualized scroll Root is a future Root behind the same base context if/when needed.
- No animation library, transitions, or motion primitives in the primitive. Consumers add motion at the cell level if they want it.
- No theming, tokens, or visual styling beyond layout-affecting CSS. Cells are styled by the consumer-supplied `render(item)`.
- No empty / loading / error states inside the primitive. The consumer controls the `items` array.
- No new path aliases.
- No `boundaryBehavior: "advance"` implementation in this plan; the contract field is also deferred until a real paged consumer needs it (see Key Decisions).
- No `cycle` paging knob; `next()` at the last page is a no-op, `prev()` at the first page is a no-op.

### Deferred to Separate Tasks

- `TilegridPagedControls` and `TilegridPageIndicator` atoms: deferred until a real paged consumer materializes (per accepted document-review finding 2). The paged Root context exposes everything needed for a consumer to author its own controls in the meantime.
- Scale-preset UX (currently `ScaleProvider` / `useScale`): deferred. The primitive accepts a plain `cellSize: number`; if a future consumer wants a preset-driven UX it can compute the number itself before passing it in.
- Virtualized scroll Root: deferred until item counts cause a measurable problem.

## Context & Research

### Relevant Code and Patterns

- **Existing pagination math to port:** `korri/shared/themes/shift/organisms/grid-view-pagination.ts` — pure, span-aware bin-packer, ~96 lines, already covers all R8 / R8a behaviors.
- **Existing tests to port (characterization spec):** `korri/shared/themes/shift/organisms/GridView.test.ts` — drives the bin-packer; serves as the authoritative behavior spec for the new `bin-pack.ts`.
- **Container measurement pattern:** `korri/shared/themes/shift/hooks/useContainerSize.ts` — ResizeObserver-backed; the new Roots reuse it. (Currently lives under the `shift` theme; consider lifting if it stays the only consumer outside the theme. See Open Questions.)
- **React composition standard:** `~/.pi/packages/react/skills/react/SKILL.md` — the in-repo skill that mandates compound + Provider, no boolean-controls-subtree, one component per file, no barrel files. The Tilegrid file family is a textbook application.
- **Card atom precedent:** `korri/shared/themes/shift/atoms/Card.tsx` — reference shape for the route's inline game tile (native `<button>` with `aria-label`, an `<img>` child, no focus hooks).
- **Spatial-nav focus engine:** `korri/shared/navigation/start.ts` and `korri/shared/navigation/focus-engine.ts` — geometric LRUD via `@bbc/tv-lrud-spatial`; reads the live DOM, requires no per-component wiring. The new primitive needs no integration code.
- **Existing E2E specs to retarget:** `korri/shared/themes/shift/organisms/GameGrid.story.e2e.ts` (keyboard) and `GameGrid.gamepad.story.e2e.ts` (gamepad). Both target story id `themes-shift-organisms-gamegrid--grid`.
- **Playwright component config:** `tools/playwright/component.config.ts` (or similar) globs `korri/**/*.story.e2e.ts`, so colocated E2E next to the new primitive is auto-picked-up.
- **shadcn-style design-system convention:** `korri/shared/design-system/components/ui/button.tsx` is the existing example. Compound widgets sit at `components/<Widget>/`, not nested under `ui/`.

### Institutional Learnings

- `docs/solutions/` does not currently contain learnings relevant to grid primitives or compound-component layout. (`docs/solutions/best-practices/` is the only subdirectory and is not pertinent.)

### External References

- None used. Every technology surface (CSS `grid-auto-flow: dense`, ResizeObserver, LRUD geometric focus) is well-established and locally pattern-precedented.

## Key Technical Decisions

- **Naming.** The primitive is named **Tilegrid**. It's distinctive (no clash with the dozens of generic `Grid` components in the React ecosystem), communicates "uniform tiles," and works well as a folder/file/atom prefix. Atoms: `TilegridCells`. Roots: `TilegridScrollRoot`, `TilegridPagedRoot`. Context module: `Tilegrid.context.tsx`. If the user objects, a search-and-replace at the end of Unit 1 is cheap.
- **Placement.** New primitive lives at `korri/shared/design-system/components/Tilegrid/`. Sibling to the existing `components/ui/` shadcn-style folder, not nested under it — `ui/` is for flat atomic primitives, Tilegrid is a compound widget that warrants its own subdirectory per the React skill's `<ui-root>/<WidgetName>/` rule.
- **Cell sizing knob.** A single `cellSize: number` (px) plus `gap: number` (px) on each Root. No min/max range, no scale presets inside the primitive. Rationale: simplest possible contract; consumers wanting preset-driven scaling resolve to a number externally and pass it in. Matches the brainstorm's "decoupled from app" goal.
- **Bin-packer reuse.** Port `grid-view-pagination.ts` verbatim into `Tilegrid/layout/bin-pack.ts`, port the `GridView.test.ts` cases into `bin-pack.test.ts` as the characterization spec, then delete the originals in Unit 6. Rationale: math is already correct and tested; rewriting risks regressions. Renaming is mostly cosmetic.
- **Paged-mode scope on first ship.** Ship the paged Root with `currentPage`, `totalPages`, `next`, `prev`, `goToPage` on the context — and **only** stop-at-edge focus boundary behavior, which is automatic from DOM scope (the spatial-nav engine finds no neighbor past the last cell because the cells of other pages aren't in the DOM). The `boundaryBehavior?: "stop" | "advance"` knob from R8b is **not** added to the contract until a paged consumer asks for `"advance"`, mirroring the document-review-accepted decision to defer the paged atoms. Rationale: avoids designing a contract field against a hypothetical UI; "stop" is the safer TV/console-flavored default; "advance" is additive when wanted.
- **No `cycle` paging knob.** `next()` at last page no-ops; `prev()` at first page no-ops. Rationale: the brainstorm did not mention cycling, the existing `GridView`'s `cycle: true` default surprised reviewers, and adding the knob later behind the same context is trivial.
- **Animation lives in the consumer.** No framer-motion peer dependency, no transition props on the primitive. Rationale: matches the user's stated preference and simplifies the contract.
- **Inline game tile in the route, not a new component.** Unit 4 inlines a small game-aware tile component inside `+index.tsx`. Rationale: only one route consumes it today; extraction can wait for a second consumer.

## Open Questions

### Resolved During Planning

- *Final naming for the file family:* Tilegrid. (See Key Decisions.)
- *Final placement under `korri/shared/`:* `korri/shared/design-system/components/Tilegrid/`.
- *Cell-sizing knob shape:* single `cellSize: number` + `gap: number`, no scale presets in the primitive.
- *Bin-packer reuse vs rewrite:* port verbatim with rename.
- *E2E retarget target:* both `GameGrid.story.e2e.ts` and `GameGrid.gamepad.story.e2e.ts` retarget to a new `Tilegrid.story.e2e.ts` and `Tilegrid.gamepad.story.e2e.ts` colocated at `korri/shared/design-system/components/Tilegrid/`, hitting a `themes-design-system-tilegrid--scroll` (or similar) story id.
- *Paged-mode `cycle` behavior:* not implemented, no knob.
- *Paged-mode `boundaryBehavior` knob:* deferred; only stop-at-edge ships, which is free.

### Deferred to Implementation

- *Final story id slug for the new primitive's stories.* The exact slug depends on Storybook's category structure (`title:` field). Implementer picks a stable slug and updates both retargeted E2E specs to match.
- *Whether `useContainerSize` moves out of `korri/shared/themes/shift/hooks/`.* If after Unit 6 it is the only `themes/shift` symbol still imported by the new primitive, lift it to `korri/shared/design-system/lib/` (or similar) as part of Unit 1 or 2. If anything else in `themes/shift` still uses it, leave it where it is and import cross-folder.
- *Whether `ScaleContext` and its tests are deleted.* After Unit 6 deletes `FeaturedGameGrid` and the route stops wrapping in `ScaleProvider` (Unit 4), `useScale` has no consumers. Implementer greps to confirm and deletes `korri/shared/themes/shift/context/ScaleContext.tsx` plus `ScaleContext.test.tsx` if orphaned. Skip if the team wants to keep the preset machinery for a near-term scale UX.
- *Whether the inline game tile in `+index.tsx` becomes a small file later.* Implementer can decide based on file length after Unit 4. Not a planning concern.

## Output Structure

```text
korri/shared/design-system/components/Tilegrid/
  Tilegrid.context.tsx         # base context type, paged extension type, hooks, Provider helpers
  Tilegrid.context.test.ts     # pure helpers if any (clamp, derive-columns); otherwise omitted
  TilegridScrollRoot.tsx       # state-free Root; CSS grid-auto-flow: dense
  TilegridPagedRoot.tsx        # owns currentPage, totalPages, next/prev/goToPage
  components/
    TilegridCells.tsx          # consumes context, renders span-aware <button>s
  layout/
    bin-pack.ts                # ported from grid-view-pagination.ts
    bin-pack.test.ts           # ported from GridView.test.ts
  Tilegrid.stories.tsx         # generic {id, image, span} fixture, both Roots
  Tilegrid.story.e2e.ts        # retargeted from GameGrid.story.e2e.ts
  Tilegrid.gamepad.story.e2e.ts # retargeted from GameGrid.gamepad.story.e2e.ts
```

This is a scope declaration; the implementer may adjust the layout if implementation reveals a better one. The per-unit `Files:` lists remain authoritative.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**Composition shape — two Roots, shared base context, one cell atom:**

```text
                          (base context: items, getKey, getSpan, cellSize, gap, columns)
                                                  ▲             ▲
                                                  │             │
        ┌─────────────────────────────────────────┘             └────────────────────────────────────┐
        │                                                                                            │
TilegridScrollRoot                                                          TilegridPagedRoot
  - reads container size                                                      - reads container size
  - derives columns                                                           - derives columns + rows
  - publishes base context only                                               - publishes base context
                                                                              - + paged extension:
                                                                                  currentPage, totalPages,
                                                                                  next, prev, goToPage,
                                                                                  pages: T[][]   (from bin-pack)
        │                                                                                            │
        │   <consumer composition — siblings of cells are user code>                                 │
        │                                                                                            │
        ▼                                                                                            ▼
   <TilegridScrollRoot ...>                                              <TilegridPagedRoot ...>
     <TilegridCells render={(item) => <ConsumerTile item={item} />} />     <ConsumerHeader />
   </TilegridScrollRoot>                                                   <TilegridCells render={...} />
                                                                           <ConsumerControls />   ← reads ctx
                                                                         </TilegridPagedRoot>
```

**Layout strategy by mode:**

| Mode | Column derivation | Item placement | State |
|------|-------------------|----------------|-------|
| Scroll | `floor(containerWidth / (cellSize + gap))`, clamp ≥1 | CSS `grid-auto-flow: dense` + `grid-column: span N` per item; no JS layout | None |
| Paged | Same as scroll, plus `floor(containerHeight / (cellSize + gap))` for rows | JS bin-packer (`bin-pack.ts`) computes `pages: T[][]`; current page items rendered with `grid-column: span N` styles | `currentPage: number` |

**Span clamping (R8a):**

| Mode | `getSpan(item)` clamp |
|------|-----------------------|
| Scroll | `min(getSpan(item), columns)` |
| Paged | `min(getSpan(item), columns, rows)` |

Spans larger than the clamp render at the clamped size; this is silent (no error, no warning) by design — matches existing `paginateItems` behavior.

**Why scroll mode needs no JS bin-packer:** CSS Grid's `grid-auto-flow: dense` already does first-fit packing for span-marked items. Our `paginateItems` is doing the same job in JS *only because* paged mode needs to know discrete page boundaries. Letting CSS handle it for scroll mode removes a whole code path and keeps span clamping the only JS logic in the scroll Root.

**Why default stop-at-edge "just works":** The spatial-nav engine resolves next focus by querying the live DOM with `@bbc/tv-lrud-spatial`'s `getNextFocus`. In paged mode only the current page's cells are mounted, so LRUD finds no neighbor past the last cell on a page. ArrowRight at the page edge becomes a no-op without any subscription, listener, or boundary code on our side.

## Implementation Units

- [ ] **Unit 1: Port the bin-packer and scaffold the Tilegrid context**

**Goal:** Land the pure layout math and the shared base context as the foundation everything else builds on. Characterization-first against the existing test suite so we know the port preserves behavior.

**Requirements:** R1, R2, R5, R8, R8a, R11

**Dependencies:** None.

**Files:**
- Create: `korri/shared/design-system/components/Tilegrid/layout/bin-pack.ts`
- Create: `korri/shared/design-system/components/Tilegrid/layout/bin-pack.test.ts`
- Create: `korri/shared/design-system/components/Tilegrid/Tilegrid.context.tsx`

**Approach:**
- Port `grid-view-pagination.ts` content into `bin-pack.ts` verbatim. Rename the exported `paginateItems` to keep its current signature (`PaginateItemsInput`, `PaginateItemsResult`, `GridItemShape`) — the function is good as is.
- Port `GridView.test.ts`'s test cases into `bin-pack.test.ts` (importing from the new path). Run the tests and iterate until they all pass — this is the characterization spec.
- Define the base context type in `Tilegrid.context.tsx`: generic over `T`, fields are `items: ReadonlyArray<T>`, `getKey: (item: T) => string`, `getSpan: (item: T) => number` (defaults to `() => 1`), `cellSize: number`, `gap: number`, `columns: number`. Define a paged-extension type that adds `currentPage`, `totalPages`, `next`, `prev`, `goToPage`, `pages: T[][]`.
- Export a guarded `useTilegrid()` hook (per the React skill: throw if used outside a Root).
- Optionally export a small `clampSpan(span, mode, columns, rows?)` helper if it deduplicates code in Units 2 and 3.

**Execution note:** Characterization-first. Port the tests before touching `bin-pack.ts`'s body and verify they fail against an empty file; then paste the body and verify they all pass. This guards the port.

**Patterns to follow:**
- Existing pure-math style of `grid-view-pagination.ts` — no React imports, no DOM access.
- Context shape and guarded hook patterns from `korri/shared/themes/shift/context/ScaleContext.tsx`.

**Test scenarios:**
- *Happy path:* 12 single-span items in a 4×3 layout return one page with all 12 items in order.
- *Happy path:* 25 single-span items in a 4×3 layout return three pages of 12, 12, 1.
- *Happy path:* item[0].span=2 in 4×3 reserves a 2×2 hero on page 1; remaining 8 single-span items pack densely around it on the same page.
- *Edge case:* `columns: 0` returns one empty page.
- *Edge case:* `rows: 0` returns one empty page.
- *Edge case:* `items: []` returns one empty page.
- *Edge case:* span larger than `min(columns, rows)` is clamped; rendered at the clamped size, not skipped.
- *Edge case:* a span-2 item that doesn't fit the remaining space on the current page starts a new page.
- *Integration:* generic over `T` — exercise with `{ id: string; span?: number }` and one custom shape to confirm the type parameter flows through.

**Verification:**
- `bun test korri/shared/design-system/components/Tilegrid/layout/bin-pack.test.ts` passes.
- `bun test korri/shared/themes/shift/organisms/GridView.test.ts` continues to pass against the still-present old file (delete in Unit 6).
- `just typecheck` passes.

---

- [ ] **Unit 2: TilegridScrollRoot + TilegridCells + scroll story**

**Goal:** Ship the simpler of the two Roots and the shared cell atom. Establish the visual story that the retargeted E2E specs will hit.

**Requirements:** R3, R4, R5, R7, R8a, R9, R11, R12, R13

**Dependencies:** Unit 1.

**Files:**
- Create: `korri/shared/design-system/components/Tilegrid/TilegridScrollRoot.tsx`
- Create: `korri/shared/design-system/components/Tilegrid/components/TilegridCells.tsx`
- Create: `korri/shared/design-system/components/Tilegrid/Tilegrid.stories.tsx`

**Approach:**
- `TilegridScrollRoot` measures its container with `useContainerSize`, derives `columns = floor(containerWidth / (cellSize + gap))` (min 1), and renders a Provider with the base context plus the inner `<div>` whose CSS sets `display: grid`, `grid-template-columns: repeat(columns, cellSize px)`, `gap: gap px`, `grid-auto-flow: dense`. Children pass through.
- `TilegridCells` reads context with `useTilegrid()`, maps over `items`, and for each item renders a `<button>` element with: `type="button"`, `aria-label` derived from a consumer-supplied function (passed as part of the cell render contract — see test scenarios for the exact shape), `style={{ gridColumn: \`span ${clamped}\`, gridRow: \`span ${clamped}\` }}`, and the consumer-supplied node from `render(item)` as its single child.
- Span clamping in scroll mode: `min(getSpan(item), columns)`. Rows are unbounded.
- The `render` prop on `TilegridCells` is a function (function-as-child or `render={...}` prop, implementer's call — both are idiomatic). The contract is `(item: T) => ReactNode`. Cells are responsible for the visual; the primitive is responsible for the layout slot.
- The story file exports a generic `{ id: string; image: string; span?: number }` fixture and at least three stories: `Scroll` (default span=1 throughout), `ScrollWithHero` (one item with `span: 2`), `ScrollEmpty` (`items: []`). Set the Storybook `title:` to a stable slug that survives the file move (working name: `Design System / Tilegrid`).

**Execution note:** Test-first for the cells atom — start by asserting the rendered DOM shape (count of buttons, aria labels, span styles) before wiring the story.

**Patterns to follow:**
- Native `<button aria-label>` shape from `korri/shared/themes/shift/atoms/Card.tsx`.
- Container measurement from `korri/shared/themes/shift/hooks/useContainerSize.ts`.
- Storybook story style from `korri/shared/themes/shift/organisms/GridView.stories.tsx`.
- React skill: only the Root creates context; atoms read via the hook; one component per file; no barrel files.

**Test scenarios:**
- *Happy path:* 8 items in a 200×800 container with `cellSize=100, gap=10` produce 8 `<button aria-label>` elements (or however columns × items resolves), each with `style.gridColumn === "span 1"`.
- *Happy path:* an item with `span: 2` produces a `<button>` with `style.gridColumn === "span 2"` and `style.gridRow === "span 2"`.
- *Edge case:* an item with `span: 99` in a 4-column container is clamped to `style.gridColumn === "span 4"`.
- *Edge case:* `items: []` renders zero buttons and the container `<div>` is still present.
- *Error path:* `<TilegridCells />` rendered outside a `TilegridScrollRoot` (or paged Root) throws via `useTilegrid()`'s guard.
- *Integration:* the primitive imports nothing from `korri/shared/themes/`, nothing from `korri/products/`, and no animation library. (Verify by grep at the end of the unit.)

**Verification:**
- `bun test` passes for any new context/cells unit tests.
- `just dev-storybook` shows the three new stories, all rendering without errors.
- `rg -n "from \"@shared/themes\"" korri/shared/design-system/components/Tilegrid/` returns nothing.
- `rg -n "framer-motion" korri/shared/design-system/components/Tilegrid/` returns nothing.

---

- [ ] **Unit 3: TilegridPagedRoot + paged stories**

**Goal:** Ship the paged Root with `currentPage`, `totalPages`, and the imperative API exposed via context (no atoms yet — those are deferred). Default stop-at-edge focus is automatic from DOM scope; no boundary code needed.

**Requirements:** R5, R6, R8, R8a, R8b (stop-at-edge default only), R11

**Dependencies:** Units 1 and 2.

**Files:**
- Create: `korri/shared/design-system/components/Tilegrid/TilegridPagedRoot.tsx`
- Modify: `korri/shared/design-system/components/Tilegrid/Tilegrid.stories.tsx` (add paged stories)

**Approach:**
- `TilegridPagedRoot` measures its container, derives `columns` and `rows`, calls `bin-pack.paginateItems({ items, columns, rows })`, and owns `const [currentPage, setCurrentPage] = useState(0)`.
- `next` increments `currentPage`, capped at `totalPages - 1` (no cycle). `prev` decrements, floored at 0. `goToPage(n)` clamps to `[0, totalPages - 1]`.
- When `items` or layout change such that `currentPage >= totalPages`, clamp it down (mirrors existing `GridView` behavior in `GridView.tsx`).
- The Provider exposes the base context plus the paged extension. The base context's `items` is the *current page's items*, not the global list — this lets `TilegridCells` continue to work unchanged across both Roots. Document this in a comment.
- Render the inner `<div>` with `display: grid`, `grid-template-columns: repeat(columns, cellSize px)`, `grid-template-rows: repeat(rows, cellSize px)`, `gap: gap px`, `grid-auto-flow: row dense`. Children pass through.
- Span clamping in paged mode: `min(getSpan(item), columns, rows)`. (The bin-packer already clamps in its layout pass; the cells layer does the same to be safe.)
- Add stories: `Paged` (default), `PagedWithHero` (item[0] span=2), `PagedEmpty` (items=[]). The paged stories use a small wrapper component that renders raw page-state inline (e.g., a `<div>` showing `currentPage / totalPages` and `<button onClick={next}>` controls) so the imperative API is exercised in Storybook even without the deferred atoms.

**Execution note:** Test-first. Write the page-derivation and clamping unit tests against the Root's pure helpers (or against a wrapper rendered in `bun:test` with `@happy-dom/global-registrator`) before writing the component body.

**Patterns to follow:**
- Existing `GridView.tsx`'s `useImperativeHandle` block as the *behavioral* spec for `next`/`prev`/`goToPage` semantics — but expose via context, not a `forwardRef` handle.
- Storybook story style from `korri/shared/themes/shift/organisms/GridView.stories.tsx`.

**Test scenarios:**
- *Happy path:* 25 single-span items, container that fits 4×3 → `totalPages === 3`; calling `next()` twice lands on `currentPage === 2` with the last-page items rendered.
- *Happy path:* `goToPage(1)` jumps to page 1 regardless of current state.
- *Edge case:* `next()` at the last page is a no-op (currentPage unchanged); `prev()` at page 0 is a no-op.
- *Edge case:* `goToPage(-5)` clamps to 0; `goToPage(999)` clamps to `totalPages - 1`.
- *Edge case:* shrinking `items` such that `totalPages` falls below `currentPage` clamps `currentPage` to `totalPages - 1` on the next render.
- *Edge case:* `items: []` produces `totalPages === 1` and renders zero cells.
- *Edge case:* a span-2 item that doesn't fit page 1's remaining cells starts page 2 (delegates to bin-packer; covered by Unit 1's tests but verify end-to-end here in DOM).
- *Integration:* a Storybook page-control button calling `next()` re-renders cells from the new page; focus engine auto-focuses the first cell of the new page if previous focus was lost (depends on engine behavior — verify in Unit 5's E2E).

**Verification:**
- `bun test` passes for paged Root tests.
- `just dev-storybook` shows the paged stories, page navigation works via the inline controls.
- `rg -n "framer-motion|forwardRef|useImperativeHandle" korri/shared/design-system/components/Tilegrid/` returns nothing.

---

- [ ] **Unit 4: Migrate the home route to TilegridScrollRoot**

**Goal:** Replace `<GameGrid games={games} viewMode="grid">` in the only runtime consumer with `<TilegridScrollRoot>` plus an inline game-aware tile. Remove the `viewMode` prop from existence.

**Requirements:** R16

**Dependencies:** Unit 2.

**Files:**
- Modify: `korri/products/app/routes/+index.tsx`

**Approach:**
- Inline a small `GameTile` component (or local function) inside `+index.tsx` that takes a `GameRecord` and renders the visual: `<img src={getGameImageUrl(game)} alt={name} />` plus any wrapper styling carried over from `Card.tsx` (className `shift-card` or equivalent). The `<button>` itself is rendered by `TilegridCells`; the inlined component returns the *children* of the button (the image, overlay if any).
- Compose: `<TilegridScrollRoot items={games} cellSize={120} gap={8} getKey={(g) => g.id} getSpan={() => 1}><TilegridCells render={(g) => <GameTile game={g} />} /></TilegridScrollRoot>`.
- Decide on `ScaleProvider`: if no other route or descendant needs it, remove it from the route. (Implementer greps to confirm; per "Deferred to Implementation" this can also be deferred to Unit 6.)
- Decide on outer `<div className="h-screen w-screen p-4">`: keep for now; sizing experimentation belongs to a separate task.
- The `aria-label` for each cell button must be the game name (`game.metadata?.name ?? game.id`) so the spatial-nav E2E specs can locate cells. Wire this through the `TilegridCells` render contract (e.g., the consumer's render function returns the visual, and `TilegridCells` derives aria-label by also accepting a `getAriaLabel?: (item) => string` prop on the cells atom — implementer's call whether to add this on the atom or have the consumer return a fragment that includes an `aria-hidden` heading; the contract decision rides with Unit 2).

**Execution note:** None. This is a swap-in replacement; existing tests and stories from Units 1–3 cover the primitive's correctness.

**Patterns to follow:**
- Visual shape of the existing plain-grid path inside `korri/shared/themes/shift/organisms/GameGrid.tsx` (the non-featured branch).
- Card image rendering from `korri/shared/themes/shift/atoms/Card.tsx`.

**Test scenarios:**
- *Happy path:* the route renders without errors and produces one `<button aria-label>` per fixture game.
- *Happy path:* clicking a tile fires a click event on the underlying `<button>` (no `onGameClick` wiring required for this plan; the click semantics survive).
- *Integration:* `just typecheck` passes after the import of `GameGrid` is removed; no orphan imports remain in the route.

**Verification:**
- `just dev-web` renders the home page with games visible in a uniform grid.
- `just typecheck` passes.
- `rg -n "viewMode|GameGrid|FeaturedGameGrid" korri/products/` returns nothing.

---

- [ ] **Unit 5: Retarget the spatial-nav E2E specs to the Tilegrid scroll story**

**Goal:** Move the keyboard and gamepad spatial-nav specs to colocate with the new primitive and point them at the new scroll story. Preserve all existing assertions.

**Requirements:** R17

**Dependencies:** Units 2 and 4. (Unit 4 must be done so the route works end-to-end, but the specs themselves target a Storybook story, not the route — so technically only Unit 2 is needed. Sequence Unit 4 before this for confidence.)

**Files:**
- Create: `korri/shared/design-system/components/Tilegrid/Tilegrid.story.e2e.ts` (ported from `GameGrid.story.e2e.ts`)
- Create: `korri/shared/design-system/components/Tilegrid/Tilegrid.gamepad.story.e2e.ts` (ported from `GameGrid.gamepad.story.e2e.ts`)

**Approach:**
- Port the file contents verbatim, changing only the `STORY_ID` constant to match the new story slug from Unit 2 (e.g., `design-system-tilegrid--scroll`). The story id depends on the Storybook `title:` chosen in Unit 2 — match it exactly.
- Confirm `tools/playwright/component.config.ts` (the testMatch pattern) globs `korri/**/*.story.e2e.ts` so the new files are auto-discovered. No config change should be needed.
- The originals at `korri/shared/themes/shift/organisms/GameGrid.story.e2e.ts` and `GameGrid.gamepad.story.e2e.ts` remain in place until Unit 6 deletes them — this lets us verify both old and new pass momentarily, then drop the old.

**Execution note:** None.

**Patterns to follow:**
- Existing `GameGrid.story.e2e.ts` and `GameGrid.gamepad.story.e2e.ts` — line-for-line, only the story id changes.

**Test scenarios:**
- *Keyboard, happy path:* ArrowDown / ArrowRight move focus across `<button aria-label>` cells (existing test 1).
- *Keyboard, happy path:* ArrowLeft after ArrowRight returns focus to the original card (existing test 2).
- *Keyboard, integration:* Enter fires a click on the focused card (existing test 3).
- *Gamepad, happy path:* Synthetic D-pad presses move focus (existing tests, ported as-is).
- *Edge case:* the new specs run against a span-aware grid for the first time — if the scroll story includes a `span: 2` cell, ArrowRight from the cell to its right of the hero should still resolve via geometry. (Add this test in addition to the ports; it's the only behaviorally new scenario from the consolidation.)

**Verification:**
- `just test-component` runs both new specs against the new story id, all assertions pass.
- The old specs at `korri/shared/themes/shift/organisms/` also still pass (they're still pointing at the old GameGrid story, which is still mounted because Unit 6 hasn't run yet). This confirms equivalent coverage before the cutover.

---

- [ ] **Unit 6: Delete obsolete files and types**

**Goal:** Drop `GameGrid`, `FeaturedGameGrid`, `GridView`, the orphaned pagination helper, the `ViewMode` type, and (conditionally) `ScaleContext` once everything else is green.

**Requirements:** R14, R15

**Dependencies:** Units 1 through 5.

**Files:**
- Delete: `korri/shared/themes/shift/organisms/GameGrid.tsx`
- Delete: `korri/shared/themes/shift/organisms/GameGrid.stories.tsx`
- Delete: `korri/shared/themes/shift/organisms/GameGrid.story.e2e.ts`
- Delete: `korri/shared/themes/shift/organisms/GameGrid.gamepad.story.e2e.ts`
- Delete: `korri/shared/themes/shift/organisms/FeaturedGameGrid.tsx`
- Delete: `korri/shared/themes/shift/organisms/FeaturedGameGrid.stories.tsx`
- Delete: `korri/shared/themes/shift/organisms/featured-grid-pagination.ts`
- Delete: `korri/shared/themes/shift/organisms/featured-grid-pagination.test.ts`
- Delete: `korri/shared/themes/shift/organisms/GridView.tsx`
- Delete: `korri/shared/themes/shift/organisms/GridView.stories.tsx`
- Delete: `korri/shared/themes/shift/organisms/GridView.test.ts`
- Delete: `korri/shared/themes/shift/organisms/grid-view-pagination.ts`
- Modify or delete: `korri/shared/themes/shift/fixtures/nav.ts` (remove `ViewMode` type; if the file becomes empty, delete it; otherwise keep)
- Conditionally delete: `korri/shared/themes/shift/context/ScaleContext.tsx`, `korri/shared/themes/shift/context/ScaleContext.test.tsx`, and remove `ScaleProvider` import from any remaining file (per "Deferred to Implementation": delete only if no consumer remains after Units 1–4)
- Conditionally move: `korri/shared/themes/shift/hooks/useContainerSize.ts` to `korri/shared/design-system/lib/` if Tilegrid becomes its only consumer (per "Deferred to Implementation")

**Approach:**
- Run `rg -n "ViewMode|GameGrid|FeaturedGameGrid|GridView|grid-view-pagination|featured-grid-pagination|useScale|ScaleProvider" korri/` before deleting; verify only the files-to-delete and their internal references show up. Anything else is a missed import that needs to be cleaned first.
- Delete in groups by topic so each commit is reviewable: (a) Featured grid trio, (b) GameGrid trio + retargeted-spec originals, (c) GridView quartet, (d) `ViewMode` type, (e) ScaleContext + useContainerSize relocation if applicable.
- Run `just typecheck`, `just lint`, `just test-unit`, and `just test-component` after the delete pass. All must pass.

**Execution note:** None.

**Patterns to follow:**
- Deleting feels small but cascades. Use `rg` aggressively. Don't trust the IDE.

**Test scenarios:**
- Test expectation: none — this unit removes code, doesn't add behavior. Coverage is a side effect (everything that previously imported the deleted symbols must already be gone or this unit's verification fails).

**Verification:**
- `just typecheck` passes.
- `just lint` passes.
- `just test-unit` passes.
- `just test-component` passes against the retargeted Tilegrid specs only.
- `rg -n "ViewMode|GameGrid|FeaturedGameGrid|GridView" korri/` returns nothing except possibly inside the new Tilegrid file family if it intentionally references prior names in comments.
- `find korri/shared/themes/shift/organisms/ -type f` shows no `GameGrid*`, `FeaturedGameGrid*`, `GridView*`, `featured-grid-pagination*`, or `grid-view-pagination*`.

## System-Wide Impact

- **Interaction graph:** The spatial-nav focus engine (`korri/shared/navigation/`) is the only system that observes the cells. Verified geometric (LRUD) — no impact from layout-mode changes. The home route is the only runtime consumer of any of the deleted organisms.
- **Error propagation:** The `useTilegrid()` guarded hook throws if used outside a Root, mirroring `useScale`'s pattern. No async paths, no thrown errors during normal layout.
- **State lifecycle risks:** `TilegridPagedRoot`'s `currentPage` clamps when `totalPages` shrinks. Verified via Unit 3 test scenarios; equivalent to existing `GridView` behavior.
- **API surface parity:** `ViewMode` is removed; no other surface in the codebase uses it (verified via `rg`).
- **Integration coverage:** Storybook component E2E (`*.story.e2e.ts`) is the integration layer that proves keyboard/gamepad → focus engine → DOM works end-to-end. Both retargeted specs pass before deletion of originals (Unit 5 verification).
- **Unchanged invariants:** Cells remain native `<button aria-label>` in the live DOM. The spatial-nav engine continues to read the DOM with no per-component wiring. `@bbc/tv-lrud-spatial` continues to be the focus algorithm. The ResizeObserver-based container-measurement pattern from `useContainerSize` continues to be used (whether in place or relocated).

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Story id slug from Unit 2 doesn't match what Unit 5's specs expect, breaking E2E silently. | Unit 5 explicitly verifies the new specs run by name against the new id; retargeted specs are written *after* the story exists and the slug is observed in Storybook. |
| `aria-label` wiring contract on `TilegridCells` is awkward (consumer's render function returns the visual *inside* the button, but the label needs to live on the button itself). | Decide the contract in Unit 2 — either add a `getAriaLabel: (item: T) => string` prop on `TilegridCells`, or accept that the consumer's render returns a fragment that includes a visually-hidden label. Whichever is chosen, the spatial-nav E2E ports verify the labels are present. |
| `ScaleProvider` removal in Unit 4 breaks something not visible during planning. | Unit 4 is conditional on a `rg` of all `useScale` and `ScaleProvider` references; the removal is reversible. Even if missed, typecheck catches dangling imports immediately. |
| Bin-packer port introduces a regression that the existing tests don't catch. | Unit 1 ports the tests *before* the body and verifies they fail against an empty file, then verifies they pass against the ported body. This is the strongest regression guard available without writing new tests. |
| Scroll-mode CSS dense packing produces a visual order that LRUD's geometric resolution can't follow cleanly when spans create irregular row heights. | Origin-doc verification confirmed LRUD picks by bounding-rect geometry; this risk materializes only if spans cause overlapping or non-rectangular cells, which CSS Grid does not produce. Unit 5's added "ArrowRight past a hero tile" scenario is the explicit guard. |
| Implementer interprets the cell render seam as "consumer renders the entire button" rather than "consumer renders the button's visual children." | Unit 2's approach text states explicitly that `TilegridCells` renders the `<button>`; the consumer's `render(item)` returns the children. Test scenarios assert the button is the rendered element. |

## Documentation / Operational Notes

- No external documentation change; the primitive is internal.
- No rollout, monitoring, or migration concerns — there is no production app yet.
- Storybook gains a `Design System / Tilegrid` (or similarly titled) section with the new stories. The `Themes / Shift / Organisms / GameGrid` and similar Storybook entries disappear in Unit 6.

## Sources & References

- **Origin document:** [./requirements.md](./requirements.md)
- Relevant code: `korri/shared/themes/shift/organisms/grid-view-pagination.ts`, `korri/shared/themes/shift/organisms/GridView.test.ts`, `korri/shared/themes/shift/organisms/GameGrid.story.e2e.ts`, `korri/shared/themes/shift/organisms/GameGrid.gamepad.story.e2e.ts`, `korri/shared/themes/shift/atoms/Card.tsx`, `korri/shared/themes/shift/hooks/useContainerSize.ts`, `korri/shared/navigation/start.ts`, `korri/products/app/routes/+index.tsx`, `korri/shared/design-system/components/ui/button.tsx`
- Working agreement: `korri/shared/themes/shift/AGENTS.md`-style placement rules in the repo `AGENTS.md` (no barrel files, `@shared/*` imports, runtime code in `korri/shared/*`, generated files read-only)
- React composition standard: `~/.pi/packages/react/skills/react/SKILL.md` (compound + Provider, no boolean-controls-subtree, one component per file)
