---
title: feat: Tilegrid animation seams (asChild + view-transition-name)
type: feat
status: active
date: 2026-04-30
---

# feat: Tilegrid animation seams (asChild + view-transition-name)

## Overview

The Tilegrid primitive is currently animation-free by design (see `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md`). This plan adds the **structural seams** that let consumers attach animation later — without coupling the primitive to any motion library and without breaking existing usage.

Three changes — two purely additive, one a deliberate clean-break API rename on `TilegridCells`:

1. **`asChild` slot composition** on Roots, so consumers can swap the grid container element. Purely additive (opt-in via prop).
2. **`getViewTransitionName?: (item) => string`** prop on Roots, so consumers can opt into the browser's View Transitions API for layout/reorder animation with zero JS animation library. Purely additive.
3. **Rename `TilegridCells`'s `render(item)` prop to `renderCell({ cellProps, item })`.** Single rendering path going forward — the consumer always renders the cell element and spreads `cellProps` onto it. No discriminated union, no two-paths-to-do-the-same-thing, no `@deprecated` half-life. The home route and all 10 stories migrate in the same PR.

Default visual rendering is preserved (cells are still `<button type="button">` with the same styles), but the call-site shape changes from `render={t => <Tile />}` to `renderCell={({ cellProps, item }) => <button {...cellProps}><Tile item={item} /></button>}`. This is ~3 extra lines per call site (×11 call sites in this repo) — and it's the only shape that genuinely supports motion libraries that need framer-style props like `layout` or `transition` on the wrapper.

Rationale for the clean break: the primitive is 8 commits old, has 1 production consumer (the home route), and ~10 demo stories. The migration cost is ~50 lines of mechanical edits across known files. Preserving BC against that surface would mean carrying a discriminated union, two render paths, and a permanent footnote in every doc explaining when to use which — a tax we'd be paying for the next several years to save 50 lines once.

## Problem Frame

The Tilegrid was deliberately shipped without animation as one of the consolidation principles ("Animation lives in the consumer"). That principle works for per-cell ambient animations (hover/focus, image fade-in) since the consumer's `render(item)` already controls the cell's visual children. It does **not** work for animations that attach to the cell wrapper itself (layout/FLIP, mount stagger) or to the grid container (AnimatePresence, page transitions), because the primitive owns those DOM nodes and the consumer has no seam to swap the element type.

The architectural answer is **slot composition**: let the consumer control which element fills each structural role, while the primitive continues to own behavior, accessibility, and layout math. This generalizes — any motion library, View Transitions, plain CSS, or no animation at all all work through the same seam.

## Requirements Trace

- **R1.** Consumers can replace the grid container element on either Root with their own element type via `asChild`.
- **R2.** Consumers always render the cell element themselves via `renderCell({ cellProps, item })`. The primitive provides a complete `cellProps` bag (style, aria-label, onClick, `type: "button"`, className) so the default `<button>` behavior is preserved with a single spread.
- **R3.** All consumer-supplied elements receive the props the primitive currently sets (style, ref where applicable, aria-label, click handler, button type, `data-tile-id`) via the spread or merge pattern.
- **R4.** Visual rendering of every cell when the consumer uses the canonical `<button {...cellProps}>` pattern is byte-identical to the current `<button>` output. The home route, all 10 stories, and E2E specs continue to render the same DOM after migration.
- **R5.** The primitive does not import `framer-motion` or any motion library. The animation-decoupling principle from the consolidation doc is preserved.
- **R6.** Consumers can opt into the View Transitions API by supplying a `getViewTransitionName(item)` callback on either Root; cells then carry the corresponding `viewTransitionName` style. The primitive does not call `document.startViewTransition` itself — that remains the consumer's responsibility.
- **R7.** Storybook gains at least one story demonstrating each seam (motion via `renderCell`, view transitions via `getViewTransitionName`), so future consumers and reviewers can see the pattern in action without leaving the design-system package.
- **R8.** The home route at `korri/products/app/routes/+index.tsx` and all 10 existing Tilegrid stories migrate from `render` to `renderCell` in the same PR as the API change. There is no intermediate state where both APIs coexist.

## Scope Boundaries

- **Not in scope:** adding a motion library to the primitive, exposing a `transition` / `animation` prop, owning animation lifecycle (e.g., `onAnimationComplete`), or building reusable motion-aware atoms (`TilegridAnimatedCell`, etc.).
- **Not in scope:** lifting `TilegridProvider` out of the Root so controls can live outside the grid container. Current pattern (controls overlay the grid via absolute positioning) is preserved. If a future consumer needs controls truly outside the animated container, that will be a separate, additive change.
- **Not in scope:** removing the orphan `framer-motion` dep from `package.json`. One demo story may use it; we'll revisit removal once the dep's role is clear.
- **Not in scope:** wiring View Transitions into the existing route at `korri/products/app/routes/+index.tsx`. The plan adds the seam; whether to use it is a separate decision.
- **Not in scope:** preserving backward compatibility for `TilegridCells`'s `render` prop. This is a deliberate clean break (see Overview rationale). The migration is mechanical and lands in the same PR.

### Deferred to Separate Tasks

- **A `TilegridProvider` standalone export** that lets consumers fully decompose Provider + Grid + Controls. Worth doing only when a real consumer demands controls outside the animated container.
- **A `useTilegridViewTransition()` helper hook** that wraps `document.startViewTransition` with the right callback shape. Wait for a real consumer to validate the API before adding sugar.

## Context & Research

### Relevant Code and Patterns

- `korri/shared/design-system/components/ui/button.tsx` — existing `asChild` precedent in this codebase. Imports `Slot` from `radix-ui` and uses it as `const Comp = asChild ? Slot.Root : "button"`. Same pattern to mirror.
- `korri/shared/design-system/components/Tilegrid/TilegridScrollRoot.tsx` — current Root structure: outer scroll `<div>` with measurement ref, inner `<div>` with grid styles, Provider wraps `{children}` inside the inner div. The inner div is the slot target.
- `korri/shared/design-system/components/Tilegrid/TilegridPagedRoot.tsx` — same outer/inner structure plus paged extension on the context. Same slot target shape.
- `korri/shared/design-system/components/Tilegrid/components/TilegridCells.tsx` — currently renders `<button type="button">` per item with a `render(item)` function-as-prop for visual children. Unit 2 renames `render` to `renderCell({ cellProps, item })` and removes the primitive's default `<button>` wrapper — the consumer always renders the cell element.
- `korri/shared/design-system/components/Tilegrid/Tilegrid.context.tsx` — base context shape; needs an optional `getViewTransitionName` field added to `TilegridBaseContext<T>` so Cells can read it.
- `korri/shared/design-system/components/Tilegrid/Tilegrid.stories.tsx` — current 10 stories with meta-level `cellSize` / `gap` controls. Demo stories for the new seams will land here.

### Institutional Learnings

- `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md` — the Tilegrid pattern doc, which explicitly states "Animation lives in the consumer" and "no `framer-motion` peer dependency." This plan extends that pattern with concrete slot machinery; the doc gets a brief cross-reference to this seam work after implementation.
- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — geometric LRUD focus. Confirms that swapping the cell wrapper element from `<button>` to anything focusable (or, with `tabIndex`, anything at all) does not break spatial navigation, since LRUD resolves by bounding-rect geometry, not DOM tag.

### External References

- Radix UI Slot pattern — `radix-ui` package's `Slot.Root` merges parent props onto a single child element via cloned ref + props. Already vendored in this repo via the `radix-ui` namespace import.
- W3C / WHATWG View Transitions API — `view-transition-name` CSS property + `document.startViewTransition()`. Chromium-stable since 2023; Firefox/Safari progress varies. Target is Electrobun (Chromium), so support is reliable for the primary deployment target.

## Key Technical Decisions

- **Slot machinery via the existing `radix-ui` package, not a new dep.** The codebase already imports `Slot` for `button.tsx`. Reusing it keeps dependency surface flat and matches in-repo conventions.
- **`asChild` on Roots replaces the *inner* grid div, not the outer scroll container.** The outer div carries the measurement ref and `overflow-y: auto`; those are infrastructure concerns the primitive must own. The inner grid div is the natural attach point for layout animations (e.g., `<motion.div layoutScroll>`, `<LayoutGroup>`).
- **`asChild` on Cells is rejected in favor of a single `renderCell` rename.** Radix's `asChild` works on a single element; `TilegridCells` is a list. A `renderCell({ cellProps, item })` function-as-prop gives the consumer full control over the cell element (including motion components, custom wrappers).
- **Clean break, not additive, on `TilegridCells`.** `render` is removed entirely; `renderCell` is the only API. Rationale in the Overview. The discriminated-union complexity that an additive shape would have introduced is avoided.
- **`cellProps` is a complete prop bag, not a minimal one.** It includes `type: "button"` so spreading onto a `<button>` preserves the safe default (prevents accidental form submission). It includes the full style block — span styles plus the zero-padding/no-border defaults — so the consumer doesn't need to remember styling boilerplate. The primitive owns correctness; the consumer owns the element type.
- **`getViewTransitionName` lives on the Root, not on Cells.** Roots already own the per-item context (items, getKey, etc.); a function `(item) => string` slots in cleanly alongside the existing resolvers. Cells read it via context. Consumers who wrap their own data updates in `document.startViewTransition()` get cell-level reorder morphing for free.
- **No new motion-aware atoms (`TilegridAnimatedCell`, etc.).** The whole point of the seam is that the consumer brings their own animation. Pre-built atoms would couple the primitive to one library or one animation style.
- **`framer-motion` stays in `package.json` for now.** A demo story will import it to demonstrate the seam. Removing the dep is a separate cleanup that requires confirming no story or test references it.

## Open Questions

### Resolved During Planning

- **Where does the asChild slot live on the Root?** → Inner grid div. Outer scroll container stays fixed. (See key decisions.)
- **One unified slot prop or one per atom?** → `asChild` on Roots (consistent with Radix); `renderCell` on Cells (because it's a list, not a single element).
- **Vendored Slot or Radix Slot?** → Radix Slot via the existing `radix-ui` package. Already in deps.
- **Should the primitive call `document.startViewTransition`?** → No. Consumer triggers it. The primitive only emits `viewTransitionName` style.

### Deferred to Implementation

- **Whether the demo `ScrollWithMotion` story uses `motion.button` or `motion.div` + `tabIndex`.** Both work; the implementer picks based on which produces the clearer demo of the slot pattern.
- **Whether to add a `viewTransitionName` value-stability test (snapshot of returned strings across re-renders).** Likely not needed since the consumer's function determines stability, not the primitive — but the implementer can add one if it clarifies intent.
- **Whether `cellProps` exposes `key` or relies on React's key being passed through `renderCell`'s return value.** React keys are special — the implementer will land whichever path produces the cleaner reconciliation behavior (likely: primitive applies the key on the renderCell return via `React.cloneElement` or the consumer is responsible for `key={cellProps.key}`).

## Implementation Units

- [x] **Unit 1: Add `asChild` support to the Root atoms (grid container slot)**

**Goal:** Both `TilegridScrollRoot` and `TilegridPagedRoot` accept an optional `asChild?: boolean`. When true, the inner grid div is replaced via Radix `Slot`, with grid styles and any consumer-supplied props merged onto the consumer's child element. The outer scroll container, measurement ref, and Provider placement remain unchanged.

**Requirements:** R1, R3, R4, R5

**Dependencies:** None.

**Files:**
- Modify: `korri/shared/design-system/components/Tilegrid/TilegridScrollRoot.tsx`
- Modify: `korri/shared/design-system/components/Tilegrid/TilegridPagedRoot.tsx`
- Modify: `korri/shared/design-system/components/Tilegrid/TilegridPagedRoot.test.tsx` (add asChild scenarios)
- Create: `korri/shared/design-system/components/Tilegrid/TilegridScrollRoot.test.tsx` (new — currently no test file for the scroll root since CSS-only layout was previously hard to test; with asChild, structural assertions matter)

**Approach:**
- Add `asChild?: boolean` to both `TilegridScrollRootProps<T>` and `TilegridPagedRootProps<T>`.
- Inside each Root's render, replace the inner `<div style={{display: "grid", ...}}>` with `const InnerComp = asChild ? Slot.Root : "div"` and render `<InnerComp style={...gridStyles}>...</InnerComp>`.
- Provider placement stays inside the inner element. All other behavior (measurement, column derivation, paged state) is untouched.
- Update JSDoc on the Root prop to note asChild expects a single React element child and that the consumer's element receives the grid styles.

**Patterns to follow:**
- `korri/shared/design-system/components/ui/button.tsx` — exact `Slot.Root` usage.

**Test scenarios:**
- Happy path — Default (no asChild): scroll root renders an inner `<div>` with the expected grid style properties applied.
- Happy path — Default (no asChild): paged root renders an inner `<div>` and existing tests still pass unchanged.
- Happy path — asChild + single child: scroll root delegates to the consumer's element; the rendered element is the consumer's tag (e.g., `<section>`), and the grid style properties are merged onto it.
- Happy path — asChild + single child on paged root: same merge behavior; paged context (currentPage, totalPages) still publishes correctly to siblings/cells.
- Edge case — asChild with className on both Root prop and child element: classNames are concatenated (Radix `Slot` default behavior), no style is silently dropped.
- Integration — asChild does not change the outer scroll container; `overflow-y: auto` and the measurement ref still attach to the outer `<div>`. Test by asserting the outer wrapper exists and is a `<div>` even when `asChild` is set.

**Verification:**
- `bun test korri/shared/design-system/components/Tilegrid/` passes including the new asChild scenarios.
- `just typecheck` passes.
- Existing Tilegrid stories render identically to before in Storybook (manual visual check).

---

- [x] **Unit 2: Replace `render` with `renderCell` on `TilegridCells` and migrate all consumers**

**Goal:** `TilegridCells`'s `render(item) => ReactNode` prop is renamed and reshaped to `renderCell({ cellProps, item }) => ReactNode`. The primitive provides a complete `cellProps` bag; consumers always render the cell element themselves and spread `cellProps` onto it. The home route and all 10 existing stories migrate in the same unit so no intermediate broken state exists. Visual DOM output of every cell, when the consumer uses the canonical `<button {...cellProps}>` pattern, is byte-identical to the current implementation.

**Requirements:** R2, R3, R4, R8

**Dependencies:** None.

**Files:**
- Modify: `korri/shared/design-system/components/Tilegrid/components/TilegridCells.tsx`
- Modify: `korri/shared/design-system/components/Tilegrid/components/TilegridCells.test.tsx`
- Modify: `korri/shared/design-system/components/Tilegrid/Tilegrid.stories.tsx` (10 stories)
- Modify: `korri/products/app/routes/+index.tsx` (the home route consumer)

**Approach:**
- Define `cellProps` as the complete prop bag the cell wrapper needs to behave like the current default cell: `aria-label`, `type: "button"` (so spread onto a `<button>` preserves the safe default), `style` (with `gridColumn: span N`, `gridRow: span N`, padding 0, border none, background transparent, cursor pointer when clickable), `onClick`, `className`, and a stable React `key` strategy (see Deferred Questions).
- Replace the existing `render` prop with `renderCell({ cellProps, item }) => ReactNode`. No other API changes to `TilegridCells` (still has `onItemClick`, `buttonClassName`).
- Migrate the home route's `<TilegridCells render={t => <GameTileVisual game={t} />} />` to `<TilegridCells renderCell={({ cellProps, item }) => (<button {...cellProps}><GameTileVisual game={item} /></button>)} />`.
- Migrate all 10 stories in `Tilegrid.stories.tsx` to the new shape. Each migration is a pure textual transform — same visual children, wrapped in the canonical `<button {...cellProps}>` spread.
- `cellProps.style` does NOT include `viewTransitionName` in this unit — that lands in Unit 3 via context, additive on top of the new shape.
- Update JSDoc on `renderCell` to clearly document: "You must spread `cellProps` onto a focusable element (typically `<button>`) for spatial navigation, accessibility, and span styling to work. The primitive provides everything needed via `cellProps`; you provide the element type and visual children."

**Patterns to follow:**
- `korri/shared/design-system/components/ui/button.tsx` for prop merging philosophy (consumer's className wins after the primitive's defaults — keep this consistent in `cellProps`).
- The existing `getKey` resolver pattern for key stability.

**Test scenarios:**
- Happy path — Canonical usage: `renderCell` returns `<button {...cellProps}>{visual}</button>` and the rendered DOM matches the previous default-render output exactly (same tag, same aria-label, same style block, same content).
- Happy path — Custom element: `renderCell` returns a `<div role="button" tabIndex={0} {...cellProps}>`; the div receives style, aria-label, onClick from cellProps via spread.
- Happy path — `renderCell` receives an `item` matching the iterated source item by reference equality.
- Happy path — `cellProps.type` is `"button"`, so a consumer who spreads onto a `<button>` without explicitly setting `type` does not get the default `"submit"` behavior.
- Edge case — Empty `items` array: cells render nothing; no crash.
- Edge case — `renderCell` returns `null` for some items: those positions are skipped without affecting layout of subsequent items.
- Edge case — Consumer's element overrides one of `cellProps`'s fields (e.g., adds their own `aria-label` after the spread): consumer wins, primitive does not warn. (Documented behavior.)
- Integration — Cell click invokes `onItemClick(item)` exactly once when the consumer spreads `cellProps.onClick` onto a clickable element.
- Integration — Span clamping still applied via `cellProps.style.gridColumn` and `gridRow`; a consumer who spreads cellProps gets the correct span automatically.
- Integration — All 10 migrated stories render in Storybook without console errors and visually match the pre-migration screenshots (manual visual diff).
- Integration — Home route renders identically to before migration (manual visual + existing E2E specs continue passing).

**Verification:**
- `bun test korri/shared/design-system/components/Tilegrid/` passes; the test file is fully migrated to `renderCell` patterns.
- `just typecheck` passes; no `render` references remain anywhere in `korri/` outside this unit's documentation comments.
- `rg -t ts -t tsx 'TilegridCells[^>]*\brender=' korri/` returns zero matches (only `renderCell=` appears).
- Existing E2E specs (`Tilegrid.story.e2e.ts`, `Tilegrid.gamepad.story.e2e.ts`) pass without modification — they query by aria-label, which is still applied via cellProps spread.

---

- [x] **Unit 3: Add `getViewTransitionName` prop and propagate to cells**

**Goal:** Both Roots accept an optional `getViewTransitionName?: (item: T) => string`. When provided, the value is published on the base context and `TilegridCells` applies `viewTransitionName: getViewTransitionName(item)` to each cell's `cellProps.style`. When absent, no `viewTransitionName` is set (the property is omitted from the style object).

**Requirements:** R6, R4, R5

**Dependencies:** Unit 2 (renderCell's `cellProps.style` is where the new property lives).

**Files:**
- Modify: `korri/shared/design-system/components/Tilegrid/Tilegrid.context.tsx` (extend `TilegridBaseContext<T>` with optional `getViewTransitionName`)
- Modify: `korri/shared/design-system/components/Tilegrid/TilegridScrollRoot.tsx`
- Modify: `korri/shared/design-system/components/Tilegrid/TilegridPagedRoot.tsx`
- Modify: `korri/shared/design-system/components/Tilegrid/components/TilegridCells.tsx`
- Modify: `korri/shared/design-system/components/Tilegrid/components/TilegridCells.test.tsx`

**Approach:**
- Add `getViewTransitionName?: (item: T) => string` to `TilegridBaseContext<T>` in the context module. Mark optional; default is undefined.
- Each Root accepts a same-named optional prop and threads it into the base context value alongside the existing resolvers.
- In `TilegridCells`, when computing `cellProps.style`, include `viewTransitionName: getViewTransitionName?.(item)` only when `getViewTransitionName` is defined. Avoid inserting an explicit `undefined` into the style object since some style-merging libraries treat that differently from omission.
- The primitive does not call `document.startViewTransition`; that remains the consumer's responsibility, documented in JSDoc on the Root prop.

**Patterns to follow:**
- Existing optional resolvers on Root (`getKey`, `getSpan`, `getAriaLabel`) for prop shape and JSDoc tone.
- Conditional style-prop application in `TilegridCells.tsx` (e.g., `cursor: onItemClick ? "pointer" : undefined`).

**Test scenarios:**
- Happy path — Prop absent: cell elements have no `viewTransitionName` set in their inline style.
- Happy path — Prop provided: each cell's inline style contains `viewTransitionName` with the value returned by the function for that item.
- Happy path — Prop function returns different values per item: each cell's `viewTransitionName` matches the corresponding item's value, not a shared one.
- Edge case — Prop provided but returns empty string: empty string is set as the style value (browser will treat as no name; primitive does not second-guess).
- Edge case — Items array changes: cell that re-renders with new item gets the new function's return value applied; React reconciliation key still anchors to `getKey`.
- Integration — Combined with `renderCell`: consumer's renderCell receives the `viewTransitionName` already merged into `cellProps.style`. Verify by spreading cellProps onto a custom element and asserting the style appears.

**Verification:**
- `bun test korri/shared/design-system/components/Tilegrid/` passes new view-transition test cases.
- `just typecheck` passes; the new optional prop is correctly typed on both Roots.
- Existing default rendering of stories and route is unchanged when the prop is absent.

---

- [ ] **Unit 4: Demonstrate seams in Storybook**

**Goal:** Storybook gains two new stories under `Design System / Tilegrid` that demonstrate each seam in action: one using `motion.button` via `renderCell` to show the cell wrapper slot, and one using `getViewTransitionName` + a "shuffle" button to show layout/reorder morphing via the View Transitions API. These serve as living docs and a smoke test that the seams compose with real motion code.

**Requirements:** R8

**Dependencies:** Units 1, 2, 3.

**Files:**
- Modify: `korri/shared/design-system/components/Tilegrid/Tilegrid.stories.tsx`

**Approach:**
- Add `ScrollWithMotion` story:
  - Imports `motion` from `framer-motion` (already in `package.json`).
  - Uses `renderCell={({ cellProps, item }) => <motion.button {...cellProps} layout transition={{ duration: 0.4 }}>...</motion.button>}` — note the same `cellProps` spread as canonical usage, just onto a motion component.
  - Includes a small "shuffle" button outside the Tilegrid that calls `setItems(shuffled)`; cells animate to new positions via framer's `layout` prop.
  - Demonstrates that the cell wrapper seam is just "spread cellProps onto whatever element you want."
- Add `ScrollWithViewTransitions` story:
  - Sets `getViewTransitionName={(item) => \`tile-${item.id}\`}` on the Root.
  - Includes a "shuffle" button that wraps `setItems(shuffled)` in `document.startViewTransition(...)`.
  - Notes in story description that View Transitions are Chromium-only as of mid-2026, so the story's animation will only be visible in Chromium-based browsers.
  - Demonstrates the View Transitions seam.
- Both stories share the meta-level `cellSize` / `gap` controls from the existing setup; no Controls panel surgery needed.

**Patterns to follow:**
- Existing story shape in `Tilegrid.stories.tsx` (Scroll, ScrollWithHero, etc.).
- Inline state in stories using `React.useState` (no fixtures, no shared mutable state).

**Test scenarios:**
- Test expectation: none — stories are visual demonstrations. Story IDs are not targeted by E2E specs in this plan; a future spec could add coverage if reorder-on-shuffle becomes a regression risk.

**Verification:**
- `just dev-storybook` renders both stories without console errors.
- Clicking "shuffle" in `ScrollWithMotion` produces a visible smooth reposition of cells (Chromium and any framer-motion-supported browser).
- Clicking "shuffle" in `ScrollWithViewTransitions` produces a visible morph in Chromium.
- `just typecheck` passes (story file's framer-motion types resolve via the existing dep).

---

- [ ] **Unit 5: Cross-link the mode-as-composition learning doc**

**Goal:** The existing best-practice doc `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md` gains a brief "Animation seams" section that points to this plan's seams (asChild + getViewTransitionName) and re-states the principle ("decouple via structural slots, not animation props"). Future readers searching `docs/solutions/` for animation guidance land on the right pattern.

**Requirements:** R8 (loose — documentation completeness)

**Dependencies:** Units 1-4 merged so the doc can reference real exports.

**Files:**
- Modify: `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md` (add `last_updated: YYYY-MM-DD` frontmatter and a new section)

**Approach:**
- Add a section near the end (before `## Related`) titled `## Animation seams (added YYYY-MM-DD)` with three brief subsections:
  - Cell wrapper via `renderCell` — one-paragraph explanation + minimal code snippet.
  - Grid container via `asChild` on Roots — one paragraph + minimal snippet.
  - View Transitions via `getViewTransitionName` — one paragraph noting the consumer triggers `document.startViewTransition` and the Chromium-stable status as of mid-2026.
- Update the frontmatter `last_updated` field to the date of the change.
- Add a one-line entry in the `## Related` section pointing back to this plan.

**Patterns to follow:**
- The existing section structure of the same doc.
- Other `last_updated`-tagged docs in `docs/solutions/best-practices/` for frontmatter conventions.

**Test scenarios:**
- Test expectation: none — pure documentation update.

**Verification:**
- The doc renders cleanly in any markdown viewer.
- A grep for `viewTransitionName` and `renderCell` in `docs/solutions/` returns the updated doc, confirming discoverability.

---

## System-Wide Impact

- **Interaction graph:** `TilegridScrollRoot`, `TilegridPagedRoot`, `TilegridCells`, and `useTilegrid<T>()` all keep their existing call surface for `cellSize`, `gap`, `items`, `getKey`, `getSpan`, `getAriaLabel`. New props (`asChild`, `getViewTransitionName`) are purely additive on Roots. The single API change is `TilegridCells`'s `render` → `renderCell` (Unit 2), migrated atomically across all in-repo callers.
- **Error propagation:** Consumer-supplied `renderCell` returns or `asChild` children that throw will bubble up the React tree as usual; the primitive does not catch or rewrap. View Transitions API errors (e.g., `startViewTransition` not supported) are entirely consumer-owned since the primitive does not call the API.
- **State lifecycle risks:** None new. Key/ref/measurement semantics are preserved. With `asChild` on a Root, the consumer's element receives styles + becomes a child of the outer scroll container; if the consumer's element disrupts layout (e.g., `display: block` overriding `display: grid` via class precedence), cells will misrender — this is a documented consumer responsibility.
- **API surface parity:** `TilegridScrollRoot` and `TilegridPagedRoot` get the same new props (`asChild`, `getViewTransitionName`) in lockstep. `TilegridCells`'s `renderCell` is mode-agnostic. Symmetric API surface across modes is preserved.
- **Integration coverage:** E2E specs at `Tilegrid.story.e2e.ts` and `Tilegrid.gamepad.story.e2e.ts` target the existing Scroll story IDs by aria-label and the implicit button selector. After Unit 2's migration, every story still spreads `cellProps` onto a `<button>`, so the rendered DOM is byte-identical and the E2E specs pass without modification. Adding E2E coverage for the new motion stories is deferred — selectors continue to work regardless of whether the wrapper is `<button>` or `<motion.button>`.
- **Unchanged invariants:** The primitive imports zero motion libraries. Visual DOM output of canonical-usage cells is byte-identical. Span clamping logic, geometric LRUD compatibility, the test-only `_testColumns` / `_testRows` escape hatch, and the meta-level Storybook controls all remain untouched. The home route at `korri/products/app/routes/+index.tsx` renders the same DOM after migration as before. The `render` prop on `TilegridCells` is the **only** invariant deliberately broken; everything else is preserved or extended.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `Slot.Root` from `radix-ui` has subtly different prop-merging semantics than expected (e.g., className concat, ref forwarding edge cases). | Mirror the exact pattern from `korri/shared/design-system/components/ui/button.tsx`, which already uses `Slot.Root` successfully. Add a test (Unit 1) asserting className concatenation and ref preservation. |
| Migrating 10 stories + the home route in one Unit 2 commit produces a large diff that's harder to review. | Diff is mechanical and repetitive — reviewer can spot-check 2-3 migrations and trust the rest. Splitting the API change from the consumer migrations would create an intermediate state where `TilegridCells` is broken — net-negative trade. |
| A consumer in Unit 2 forgets to spread `cellProps` and the cell becomes unfocusable / unstyled. | `cellProps` carries `type: "button"`, full style block, and onClick — forgetting to spread produces a visibly broken cell that fails the existing E2E specs immediately. The migration tests in Unit 2 catch this. |
| Demo `ScrollWithMotion` story drags `framer-motion` into the test bundle, slowing down Storybook builds. | `framer-motion` is already a dep; story-only imports do not affect runtime bundle size. Storybook build time impact is negligible. |
| `getViewTransitionName` returning unstable values per render causes unwanted morphs. | Documented in JSDoc that the function should return stable values per item. Not enforced by code — same posture as `getKey`. |
| A future `TilegridProvider` standalone export forces a refactor of this Unit 1 / Unit 3 work. | Plan ahead: keep Provider placement and context shape unchanged in this plan. The future Provider extraction will be additive (re-export the existing `TilegridProvider`) rather than a rewrite. |

## Documentation / Operational Notes

- After Unit 5 lands, future Tilegrid consumers searching `docs/solutions/` for animation-related questions will discover the seams via the cross-linked best-practice doc.
- No deployment, monitoring, or rollout impact. Pure additive primitive change with no public API breakage.
- The orphan `framer-motion` dep gets a documented purpose (the demo story) post-this-plan; deciding whether to remove it altogether or keep it as a sanctioned demo dep is a future cleanup.

## Sources & References

- Origin: this conversation (no requirements doc — bootstrap captured in Phase 0.4 of `ce:plan` invocation, 2026-04-30).
- Related code:
  - `korri/shared/design-system/components/Tilegrid/` — full primitive directory.
  - `korri/shared/design-system/components/ui/button.tsx` — `asChild` prior art.
  - `korri/products/app/routes/+index.tsx` — current consumer; unchanged by this plan.
- Related docs:
  - `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md` — the pattern doc this plan extends.
  - `docs/plans/2026-04-30-005-refactor-tilegrid-primitive-consolidation-plan.md` — the originating consolidation plan.
- External: Radix UI Slot pattern docs; W3C View Transitions API specification.
