---
title: "feat: Tilegrid rail mode supports rectangular cells and per-item column spans"
type: feat
status: shipped
date: 2026-04-30
origin: docs/brainstorms/2026-04-30-shift-home-screen-visual-language-requirements.md
---

# feat: Tilegrid rail mode supports rectangular cells and per-item column spans

## Overview

Extend the `TilegridRailRoot` primitive so a single horizontal rail can carry **heterogeneous-width tiles at a uniform row height**: one wide landscape "feature" tile (≈16:9) sitting alongside several portrait 2:3 cover posters, all scrolling together as one row. This unblocks the Switch-style hero rail explored in the home-screen visual-language brainstorm (see origin: `docs/brainstorms/2026-04-30-shift-home-screen-visual-language-requirements.md`, R7–R8).

Today the rail Root forces square uniform cells (`cellSize: number | string`) and hardcodes `getSpan: () => 1` with `maxSpan: { columns: 1, rows: 1 }`. The rail needs **rectangular cells** (separate column width and row height) and **per-item column spans** in rail mode only — without changing scroll or paged behavior, and without collapsing the two-Root composition pattern.

## Problem Frame

The home-screen exploration (origin doc, R8) requires a horizontal rail where focusing different tiles drives a hero region above. The natural visual language is the Nintendo Switch 2 home rail: one ~16:9 feature tile to the left, several 2:3 cover posters to the right, all the same height, scrolling as one unit.

The exploration is hard-constrained to use the existing `Tilegrid` primitive (it is the only sanctioned grid primitive in `korri/shared/design-system/`). The rail Root is intentionally minimal — square cells, span-1 — because the original use case was uniform mini-rails. To support the Switch-style rail, the primitive needs a small principled evolution that:

- Stays inside the two-Root composition pattern (no `mode` prop) — see `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md`.
- Keeps `TilegridScrollRoot` and `TilegridPagedRoot` behavior identical.
- Preserves backward compatibility for every existing rail call site.
- Uses the existing `useResolvedCSSLength` mechanism for any new length inputs (numbers stay zero-cost; strings resolve via sentinel + ResizeObserver).

## Requirements Trace

- R1. **Rectangular cells in rail mode.** `TilegridRailRoot` accepts a rectangular `cellSize` (separate width and height) so a single cell can be a 2:3 portrait poster, not just a square. (Origin R7, R8.)
- R2. **Per-item horizontal spans in rail mode.** A tile can declare `span: N` (integer) and occupy N column-widths plus (N-1) gap-widths in one row, sharing the same row-height as span-1 tiles. (Origin R7, R8.)
- R3. **Backward compatibility.** Existing call sites passing a numeric or string `cellSize` continue to render square uniform rails with span clamped to 1×1, with no source edits required and no existing test churn.
- R4. **Scroll/paged unchanged.** `TilegridScrollRoot` and `TilegridPagedRoot` produce identical layout, span, and context output before and after this change. Existing tests and stories for both Roots remain green without modification.
- R5. **Storybook coverage.** A new Storybook story under the existing `Tilegrid.stories.tsx` demonstrates the heterogeneous rail (one wide feature tile + several portrait posters in one row) and is exercisable via Storybook controls for cell width, cell height, gap, and the feature tile's span.
- R6. **Spatial navigation unchanged.** The existing LRUD-driven gamepad story (`Tilegrid.gamepad.story.e2e.ts`) keeps passing without edits. The geometric LRUD model handles heterogeneous widths automatically.

## Scope Boundaries

- Out: any change to `korri/products/app/**`. Storybook only.
- Out: per-item *row* spans in rail mode (the rail is one row by definition).
- Out: per-tile *aspect override*. Cells are rectangular at the Root level, not per-tile.
- Out: auto-fit / `minCellSize` for scroll or paged Roots. Tracked separately in `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md` "Caveats and Open Follow-ups".
- Out: edits to `korri/shared/themes/**` or unrelated explorations.
- Out: edits to `Tilegrid.gamepad.story.e2e.ts` unless a real bug surfaces.
- Out: collapsing `TilegridScrollRoot` / `TilegridPagedRoot` / `TilegridRailRoot` into one Root with a `mode` prop. The two-Root architecture stays intact.
- Out: introducing new files. All work happens in existing files unless genuinely necessary.

## Context & Research

### Relevant Code and Patterns

- `korri/shared/design-system/components/Tilegrid/Tilegrid.context.tsx` — base context (`TilegridBaseContext<T>`), `GridItemShape`, `clampSpan`, and the architecture comment explaining the two-Root pattern. The context is non-generic at the React layer; `useTilegrid<T>()` casts on read.
- `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.tsx` — the Root being extended. Today: `gridAutoColumns: cellSize`, `gridTemplateRows: cellSize`, `getSpan: () => 1`, `maxSpan: { columns: 1, rows: 1 }`.
- `korri/shared/design-system/components/Tilegrid/TilegridScrollRoot.tsx` and `TilegridPagedRoot.tsx` — sibling Roots. Read for shape consistency; do not modify unless a context-shape change forces a coordinated update.
- `korri/shared/design-system/components/Tilegrid/components/TilegridCells.tsx` — the single cell atom. Reads `getSpan`, `clampSpan`, `maxSpan` from context and applies `gridColumn: span N / gridRow: span N`. This is where the "rail spans only columns, never rows" decision is enforced.
- `korri/shared/design-system/lib/useResolvedCSSLength.ts` — resolves `number | string` length inputs to pixels live; numeric inputs are zero-cost (no sentinel, no observer). Reused for both `cellSize.width` and `cellSize.height`.
- `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.test.tsx` — existing test shape to mirror for new behavior.
- `korri/shared/design-system/components/Tilegrid/Tilegrid.stories.tsx` — control-driven combinatorial story shape. Extend this file; do not add a sibling stories file.
- `korri/shared/design-system/components/Tilegrid/Tilegrid.context.test.tsx` — context-level tests covering `clampSpan`'s axis semantics. Note: `clampSpan(5, { columns: 8, rows: Infinity })` returns 5 — `Infinity` is the established "unbounded axis" sentinel (used by scroll mode).

### Institutional Learnings

- `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md` — explains *why* there are sibling Roots instead of a `mode` prop. This plan must stay inside that pattern.
- `docs/solutions/best-practices/css-length-props-with-sentinel-resolution-2026-05-01.md` — the resolution contract for length-accepting props (number = zero-cost; string = sentinel + ResizeObserver).
- `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md` — fluid-token rules. Numeric defaults are acceptable when they are hard layout invariants (e.g., the existing `gap = 8`). Avoid hardcoded pixels for new defaults; prefer theme variables when defaults are needed.

### External References

- None. The local primitive and institutional learnings cover the design space. (Local research is sufficient — the codebase has multiple direct examples of the pattern this plan extends.)

## Key Technical Decisions

- **Stay inside the two-Root composition pattern.** Do not introduce a `mode` prop, do not collapse Roots, do not consolidate `TilegridRailRoot` with the scroll or paged Roots. Rail capability lives on `TilegridRailRoot`. (Rationale: see origin learning on mode-as-composition.)
- **Extend the context additively, don't replace `cellSize: number`.** Add an optional `cellSizeRect?: { width: number; height: number }` field to `TilegridBaseContext`. Square Roots leave it undefined; rectangular rail Root publishes it. The existing `cellSize: number` field stays as the resolved width (square Roots: width = height; rectangular rail: width). This keeps the diff small, leaves scroll and paged Roots untouched, and avoids invalidating every existing context consumer. (Trade-off: two ways to read the value. Mitigation: a code comment on the context type that says "If `cellSizeRect` is published, prefer it; `cellSize` is its width for backward read-compat.")
- **Express span-axis as a context flag, not a split `getSpan`.** Add an optional `spanAxis?: "both" | "column-only"` field to `TilegridBaseContext`, defaulting to `"both"` when absent. `TilegridCells` reads it and emits `gridRow: span 1` instead of `gridRow: span ${span}` when `column-only`. Rail Root publishes `"column-only"`; scroll and paged Roots leave it undefined (defaulting to `"both"`). Smaller surface than splitting `getSpan` into `getColumnSpan` / `getRowSpan`, and keeps the cell-atom's contract simple.
- **Rail rectangular `maxSpan` uses `Infinity` for the unbounded axis.** Rail mode publishes `maxSpan: { columns: items.length, rows: Infinity }` so `clampSpan(N, maxSpan)` returns `min(N, items.length)` for column spans. The row-axis clamp to 1 is enforced separately by `TilegridCells` reading `spanAxis === "column-only"`. (`Infinity` is already the established unbounded-axis sentinel — see scroll mode and the existing `clampSpan` test "treats Infinity rows as unbounded".)
- **`cellSize` prop accepts a discriminated input.** `TilegridRailRoot.cellSize` becomes `number | string | { width: number | string; height: number | string }`. When the value is a number or string, behavior is unchanged (square; backward-compatible). When the value is an object, both `width` and `height` are independently resolved through `useResolvedCSSLength`.
- **Two sentinels in rectangular mode, one each for width and height.** When `cellSize` is rectangular, mount one sentinel per dimension that has a string input, each measured independently. Numeric dimensions stay zero-cost (no sentinel). This mirrors the existing `cellSize` + `gap` two-sentinel pattern.

## Open Questions

### Resolved During Planning

- **Should the context type extension be additive (`cellSizeRect?`) or a replacement (`cellSize: { width, height }` everywhere)?** Resolved: additive. Smaller blast radius, no scroll/paged churn, no test churn elsewhere. Documented in Key Technical Decisions.
- **Should span-axis be a context flag or a split-resolver API (`getColumnSpan` / `getRowSpan`)?** Resolved: context flag. Smaller surface, keeps the cell atom's contract simple. Documented in Key Technical Decisions.
- **What sentinel value should rail's `maxSpan.rows` use given `clampSpan`'s scalar clamp?** Resolved: `Infinity`. It's already the established unbounded-axis sentinel for scroll mode and the existing `clampSpan` test asserts the contract.
- **Where does the new Storybook story live?** Resolved: extend `Tilegrid.stories.tsx`; do not add a sibling file. Matches the existing combinatorial pattern in that file.

### Deferred to Implementation

- **Exact default cell width and height for the new heterogeneous-rail story.** The story needs sensible defaults that look like the Switch home rail at the 1080p Storybook viewport (origin R6). Pick values during story authoring; document in the story's `argTypes` description if non-obvious.
- **Whether `cellSizeRect` should also expose `height` separately even for square-mode Roots.** Possibly useful for downstream layout consumers, but speculative. Defer until a consumer actually needs it.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

The two changes — rectangular cells and per-item column spans — meet at the context boundary. The shape of the change:

```
TilegridBaseContext<T>:                 (existing fields unchanged)
  + cellSizeRect?: { width: number; height: number }     // rail-only; undefined elsewhere
  + spanAxis?: "both" | "column-only"                    // rail = "column-only"; default "both"

TilegridRailRoot:
  cellSize: number | string | { width: ..., height: ... }
    │
    ├── number | string  ──► resolve once, square, behavior unchanged
    └── { width, height } ──► resolve each independently, publish cellSizeRect,
                              gridAutoColumns: width, gridTemplateRows: height
  getSpan: <consumer-supplied or item.span ?? 1>         // no longer hardcoded to 1
  maxSpan: { columns: items.length, rows: Infinity }     // unbounded row axis
  spanAxis: "column-only"                                // published into context

TilegridCells:
  span = clampSpan(getSpan(item), maxSpan)
  gridColumn: span ${span}
  gridRow:    spanAxis === "column-only" ? "span 1" : `span ${span}`
```

Compatibility shape, matrix style:

| Root            | cellSize input        | cellSizeRect     | spanAxis      | maxSpan                          | gridRow per cell |
|-----------------|-----------------------|------------------|---------------|----------------------------------|------------------|
| Scroll          | number/string         | undefined        | undefined     | { columns, rows: Infinity }      | `span ${span}`   |
| Paged           | number/string         | undefined        | undefined     | { columns, rows }                | `span ${span}`   |
| Rail (square)   | number/string         | undefined        | `column-only` | { columns: items.length, rows: ∞ } | `span 1`        |
| Rail (rect)     | { width, height }     | { width, height }| `column-only` | { columns: items.length, rows: ∞ } | `span 1`        |

The square-rail row gets `spanAxis: "column-only"` even in backward-compat mode because the rail is conceptually a single row regardless of cell shape. With `getSpan` defaulting to `item.span ?? 1` (instead of hardcoded `() => 1`), a square rail with `item.span: 2` would now span 2 columns — a behavior change, but a coherent one that an existing call site can opt into only by setting `item.span` (it cannot accidentally regress because nothing was reading `item.span` in rail mode before).

## Implementation Units

- [x] **Unit 1: Extend `Tilegrid.context.tsx` to express rectangular cells and column-only span axis**

**Goal:** Add the two new optional fields (`cellSizeRect`, `spanAxis`) to `TilegridBaseContext<T>` so Roots can publish heterogeneous-cell and column-only-span information without breaking existing consumers.

**Requirements:** R1, R2, R3, R4

**Dependencies:** None.

**Files:**
- Modify: `korri/shared/design-system/components/Tilegrid/Tilegrid.context.tsx`
- Modify: `korri/shared/design-system/components/Tilegrid/Tilegrid.context.test.tsx`

**Approach:**
- Add `cellSizeRect?: { width: number; height: number }` to `TilegridBaseContext<T>`. Add a JSDoc comment explaining: when present, `cellSizeRect.width === cellSize`; when absent, the Root publishes square cells and consumers should read `cellSize`.
- Add `spanAxis?: "both" | "column-only"` to `TilegridBaseContext<T>`. Add a JSDoc comment explaining: defaults to `"both"` when absent; `"column-only"` is published by rail Root and instructs `TilegridCells` to clamp the row-axis span to 1.
- Do not change `clampSpan` — its scalar contract still works because rail mode will use `maxSpan.rows: Infinity` and the row-axis clamp to 1 is enforced in `TilegridCells`, not in `clampSpan`.
- Do not change `useTilegrid<T>()` or the runtime cast pattern.

**Patterns to follow:**
- The existing `paged?: TilegridPagedExtension` field is the precedent for "optional Root-specific extension on the context." Mirror its JSDoc style and optional-undefined contract.

**Test scenarios:**
- Happy path: a context value with `cellSizeRect: { width: 200, height: 300 }` is readable through `useTilegrid<T>()` and round-trips its values.
- Happy path: a context value with `spanAxis: "column-only"` is readable through `useTilegrid<T>()`.
- Backward compatibility: a context value that omits both new fields still passes type-checking and `useTilegrid<T>()` returns `cellSizeRect: undefined`, `spanAxis: undefined`. (Existing scroll/paged tests cover this implicitly; an explicit assertion is welcome but optional.)
- Existing `clampSpan` tests continue to pass unchanged.

**Verification:**
- `just typecheck` is green.
- `just test-unit -- Tilegrid` is green for the context test file.
- The pre-existing `clampSpan` Infinity-rows test continues to pass without modification.

---

- [x] **Unit 2: Update `TilegridCells` to honor `spanAxis === "column-only"`**

**Goal:** When the published context's `spanAxis` is `"column-only"`, emit `gridRow: span 1` instead of `gridRow: span ${span}` so a multi-column rail tile occupies exactly one row regardless of its column span.

**Requirements:** R2, R4

**Dependencies:** Unit 1.

**Files:**
- Modify: `korri/shared/design-system/components/Tilegrid/components/TilegridCells.tsx`

**Approach:**
- Read `spanAxis` from `useTilegrid<T>().base`.
- When `spanAxis === "column-only"`, set `style.gridRow = "span 1"` regardless of the resolved `span` value.
- Otherwise (the existing default, `undefined` or `"both"`), keep `style.gridRow = ` `span ${span}`.
- `style.gridColumn` is always `span ${span}` (unchanged).
- `clampSpan` continues to be called as today — the row-axis clamp to 1 is independent of `clampSpan`'s output.

**Patterns to follow:**
- The existing `viewTransitionName` conditional (`if (viewTransitionName !== undefined) { ... }`) is the precedent for "Root-published optional context field gates a style mutation." Follow the same shape.

**Test scenarios:**
- *(Tested indirectly through `TilegridRailRoot.test.tsx` in Unit 3 — the rail Root is the only producer of `spanAxis: "column-only"`. A direct unit test for `TilegridCells` is acceptable but not required; the rail tests cover the interaction end-to-end. If a direct test is added, it goes in a new `TilegridCells.test.tsx` file.)*
- Test expectation: regression-only -- existing scroll and paged story coverage proves the default branch (`spanAxis === undefined`) still emits `gridRow: span ${span}`.

**Verification:**
- `just typecheck` is green.
- `just test-unit -- Tilegrid` continues to pass for all existing scroll, paged, and rail tests.
- Existing `Tilegrid.stories.tsx` scroll and paged stories render unchanged in Storybook.

---

- [x] **Unit 3: Extend `TilegridRailRoot` to accept rectangular `cellSize` and per-item column spans**

**Goal:** Make `TilegridRailRoot` accept `cellSize: number | string | { width: ..., height: ... }`, use the consumer-supplied `getSpan` (defaulting to `item.span ?? 1`), publish `cellSizeRect` and `spanAxis: "column-only"` in the base context, and apply `gridAutoColumns: width` / `gridTemplateRows: height` when rectangular.

**Requirements:** R1, R2, R3, R6

**Dependencies:** Unit 1, Unit 2.

**Files:**
- Modify: `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.tsx`
- Modify: `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.test.tsx`

**Approach:**
- Widen the `cellSize` prop type to `number | string | { width: number | string; height: number | string }`.
- Detect the rectangular shape (object with `width` and `height`) and resolve each dimension through a separate `useResolvedCSSLength` call. Numeric dimensions stay zero-cost; string dimensions mount their own sentinel.
- For the square shape (number or string), keep the existing single-resolution path verbatim — backward compatibility.
- Add `getSpan?: (item: T) => number` to `TilegridRailRootProps<T>` (mirroring how the scroll/paged Roots accept it). When unspecified, default to `(item) => item.span ?? 1`.
- In the published base context: set `getSpan` to the consumer-supplied / default resolver (no longer hardcoded to `() => 1`); set `maxSpan: { columns: Math.max(1, items.length), rows: Number.POSITIVE_INFINITY }`; set `spanAxis: "column-only"`; populate `cellSizeRect` only when the rectangular shape is in use.
- For rectangular inputs, apply `gridAutoColumns: <width cssValue>` and `gridTemplateRows: <height cssValue>` on the inner grid container; keep `gridAutoFlow: "column"` and `width: "fit-content"`.
- Render two sentinels (one per dimension with a string input) when the rectangular path is active. Each sentinel uses the existing `data-tilegrid-sentinel` attribute pattern with distinct identifiers (e.g., `"cell-size-width"` and `"cell-size-height"`).
- Do not change the outer scroll container, `asChild` behavior, or `Slot.Root` usage.

**Execution note:** Test-first. Existing `TilegridRailRoot.test.tsx` already covers backward-compat shape (numeric `cellSize`, square layout, `maxSpan: { columns: 1, rows: 1 }`). Three of those existing assertions WILL change behavior intentionally:
- `getSpan(tile("hero", 3))` now returns 3, not 1 (rail now respects per-item span).
- `maxSpan.columns` now equals `items.length` (or 1 for empty), not 1.
- `maxSpan.rows` now equals `Infinity`, not 1.

These three assertions in the existing test file should be revised to reflect the new contract; the surrounding tests stay unchanged. Add new tests for the rectangular path before implementing it.

**Patterns to follow:**
- `TilegridRailRoot.tsx` itself for the existing single-`cellSize` resolution and sentinel-mounting shape.
- `useResolvedCSSLength.ts` for the resolution contract (numeric = zero-cost, string = sentinel-driven).
- `TilegridScrollRoot.tsx` for how `getSpan` is accepted as a consumer-overridable prop with a default.

**Test scenarios:**
- Happy path: rectangular `cellSize={{ width: 240, height: 340 }}` with `gap={8}` produces `gridAutoColumns: "240px"` and `gridTemplateRows: "340px"` on the inner grid.
- Happy path: rectangular `cellSize` with string dimensions (`{ width: "16rem", height: "var(--rail-row-height)" }`) renders two sentinels (`cell-size-width`, `cell-size-height`) with the verbatim CSS expressions, and the inner grid uses both expressions verbatim.
- Happy path: with rectangular `cellSize`, the published `cellSizeRect` carries the resolved pixel `{ width, height }` (via `renderHook(() => useTilegrid<T>())`).
- Happy path: an item with `span: 4` plus three `span: 1` items publishes `getSpan(tile("hero", 4))` returning 4, and `clampSpan(4, maxSpan)` returns 4 (since `maxSpan.columns: 4` for a 4-item rail).
- Happy path: `spanAxis: "column-only"` is published in the base context.
- Edge case: empty rail (`items: []`) publishes `maxSpan: { columns: 1, rows: Infinity }` and does not throw.
- Edge case: the rail Root is used with a single span-1 item — behavior matches the pre-change rail (square cells, span clamped to 1, scrolling unaffected).
- Backward compatibility: numeric `cellSize={120}` produces `gridAutoColumns: "120px"` and `gridTemplateRows: "120px"` (square), no rectangular sentinels rendered, `cellSizeRect` is undefined in context.
- Backward compatibility: string `cellSize="6rem"` produces a single `cell-size` sentinel (not two), and the inner grid uses the string verbatim in both `gridAutoColumns` and `gridTemplateRows`.
- Integration: revise the three existing assertions in `TilegridRailRoot.test.tsx` whose contracts intentionally change (`getSpan` no longer hardcoded to 1; `maxSpan.columns` is `items.length`; `maxSpan.rows` is `Infinity`). All other existing rail tests pass unchanged.

**Verification:**
- `just typecheck` is green.
- `just test-unit -- Tilegrid` is green for all rail tests, both new and revised.
- All other Tilegrid tests (context, scroll, paged, cells if present) remain green.
- A `TilegridRailRoot` in Storybook with `cellSize={{ width: 480, height: 270 }}` and `items` containing one `span: 4` tile and several `span: 1` tiles renders one wide tile next to several narrower tiles, all the same height, on one horizontally scrolling row.

---

- [x] **Unit 4: Add a Storybook story for "Rail / Heterogeneous (Switch-style)"**

**Goal:** Add a controllable Storybook story to `Tilegrid.stories.tsx` that demonstrates the heterogeneous rail visually — one wide landscape "feature" tile next to several portrait covers, all in one horizontally scrolling row at the same height.

**Requirements:** R5

**Dependencies:** Unit 3.

**Files:**
- Modify: `korri/shared/design-system/components/Tilegrid/Tilegrid.stories.tsx`

**Approach:**
- Add a new story (e.g., named `RailHeterogeneous` titled "Rail / Heterogeneous (Switch-style)") that renders `TilegridRailRoot` with a fixture list whose first item has `span: 4` (or controllable via args) and the remaining items use `span: 1`.
- Expose `argTypes` for: cell width (number or string), cell height (number or string), gap, and the feature tile's span (integer 1–6 reasonable range).
- Use sensible defaults that look like the Switch home rail at the 1080p Storybook viewport: e.g., width ~480px, height ~270px (close to 16:9 at the row's height), feature span 1 (so the controls' default state shows a baseline rail; user changes span to see the feature treatment). The exact defaults are an implementation choice — pick what looks right when authoring.
- Reuse the existing `renderTileCell` (or whatever the sibling stories use) so the cell visual style matches the rest of `Tilegrid.stories.tsx`.
- Do not delete or rewrite existing stories. Do not introduce a new stories file.

**Patterns to follow:**
- The existing rail story branch in `Tilegrid.stories.tsx` (around lines 296–305) — same `TilegridRailRoot` + `TilegridCells` shape.
- The existing combinatorial `args` / `argTypes` style used by the other stories in the same file.

**Test scenarios:**
- Test expectation: none -- this unit is a Storybook visual demonstration. Behavioral coverage is in Unit 3's tests. The acceptance signal is opening the story in Storybook and confirming the visual matches the Switch-rail intent (one wide tile + several portrait tiles, same height, horizontally scrolling, focus traversal works).

**Verification:**
- `just dev-storybook` boots successfully.
- The new "Rail / Heterogeneous (Switch-style)" story appears in the Storybook sidebar under the Tilegrid group.
- The story renders at the 1080p Storybook viewport with the expected layout.
- Tab and arrow-key focus traversal moves between the heterogeneous tiles correctly (LRUD geometric model handles widths automatically — no bespoke handling needed).
- `just check` (typecheck + lint + format + tests) passes.

## System-Wide Impact

- **Interaction graph:** The base context gains two optional fields. Three context consumers exist: `TilegridCells` (reads `spanAxis` after this change), `TilegridScrollRoot`, and `TilegridPagedRoot` (both produce the context but do not read these new fields). Both producing Roots leave the new fields undefined, so their behavior is unchanged.
- **Error propagation:** No new error paths. All new fields are optional with safe defaults.
- **State lifecycle risks:** The rectangular-cell path mounts two sentinels (one per dimension) when both dimensions are strings. The sentinels' `ResizeObserver` lifecycles are governed by `useResolvedCSSLength`, which already handles cleanup correctly. No new lifecycle risk.
- **API surface parity:** Only `TilegridRailRoot` gains new capability. Scroll and paged Roots intentionally do not. This is by design — heterogeneous rectangular cells are a rail concept; the scroll/paged Roots' uniform-square-cell contract is part of their identity.
- **Integration coverage:** The `Tilegrid.gamepad.story.e2e.ts` end-to-end story already covers focus traversal across rail tiles. The LRUD geometric model handles heterogeneous widths automatically. No new e2e is needed unless a real bug surfaces during manual Storybook validation.
- **Unchanged invariants:**
  - `TilegridScrollRoot` and `TilegridPagedRoot` produce identical context output, identical `gridAutoColumns` / `gridTemplateRows` / `gridAutoFlow` styles, and identical span behavior before and after this change.
  - `clampSpan` is unchanged. Its scalar contract still works for rail because rail uses `maxSpan.rows: Infinity` (the established unbounded-axis sentinel).
  - The two-Root composition pattern is preserved. No `mode` prop, no Root collapse, no shared rendering branches.
  - Existing call sites passing numeric or string `cellSize` to `TilegridRailRoot` continue to render square uniform rails. Existing rail tests covering the backward-compat shape continue to pass without source edits.
  - `TilegridCells` continues to call `clampSpan` and to apply `gridColumn: span N`. Only the `gridRow` style is conditionally adjusted by the new `spanAxis` flag.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| The behavior change in `TilegridRailRoot` (no longer hardcoding `getSpan: () => 1`) silently regresses an existing call site that passes `item.span > 1` expecting it to be ignored. | Audit the repo for existing rail call sites before merging. The rail Root is only used in `Tilegrid.stories.tsx` today and has no `korri/products/app/**` consumers (per scope), so the audit is bounded. Document the contract change in a code comment on the rail Root. |
| `clampSpan(N, { columns: items.length, rows: Infinity })` might surprise on a 1-item rail with `span: 4` (clamps to 1). | This is correct behavior — a 1-item rail can't have a span-4 tile. Document the clamp behavior in the rail Root's prop JSDoc. |
| Two-sentinel rectangular path interacts poorly with `asChild` (Radix `Slot`) when the consumer's slotted child has its own grid styles. | Existing single-sentinel `asChild` behavior is preserved unchanged; the rectangular path follows the same pattern. The rail's outer scroll container still owns sentinel mounting, not the slotted child. Add a test for `asChild` + rectangular `cellSize`. |
| A future contributor reads `cellSize` from context and is confused that it's the width in rectangular mode, not the cell size. | Resolved by a code comment on `TilegridBaseContext.cellSize`: "When `cellSizeRect` is published, prefer reading from it; `cellSize` is its width for backward read-compat." |
| Adding `spanAxis` to the base context creates a third "rail-only" concept that scroll/paged Roots must remember to leave undefined. | Document the field's intent in JSDoc on the context type. Add an explicit assertion in scroll and paged Root tests that `base.spanAxis === undefined` to lock the contract. (Optional; covered indirectly by existing tests that don't observe behavior change.) |

## Documentation / Operational Notes

- This is a primitive evolution; no rollout, monitoring, or migration concerns.
- The new Storybook story is the load-bearing acceptance demonstration for the home-screen visual-language exploration that motivated this work (see origin: `docs/brainstorms/2026-04-30-shift-home-screen-visual-language-requirements.md`, R7–R8).
- After merge, `docs/brainstorms/2026-04-30-shift-home-screen-visual-language-requirements.md` follow-up planning can use the heterogeneous rail capability to build the Hero variant's rail-drives-hero focus model (R8) without further primitive changes.

## Sources & References

- **Origin document:** [`docs/brainstorms/2026-04-30-shift-home-screen-visual-language-requirements.md`](../brainstorms/2026-04-30-shift-home-screen-visual-language-requirements.md) (R7, R8).
- Related institutional learnings:
  - `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md`
  - `docs/solutions/best-practices/css-length-props-with-sentinel-resolution-2026-05-01.md`
  - `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md`
- Related plan: `docs/plans/2026-04-30-008-feat-tilegrid-css-length-cellsize-plan.md` (introduced the `useResolvedCSSLength` mechanism this plan reuses).
- Primary code surfaces:
  - `korri/shared/design-system/components/Tilegrid/Tilegrid.context.tsx`
  - `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.tsx`
  - `korri/shared/design-system/components/Tilegrid/components/TilegridCells.tsx`
  - `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.test.tsx`
  - `korri/shared/design-system/components/Tilegrid/Tilegrid.stories.tsx`
  - `korri/shared/design-system/lib/useResolvedCSSLength.ts`
