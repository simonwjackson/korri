---
title: Evolving a shared-context layout primitive without breaking existing Roots
date: 2026-05-01
category: best-practices
module: korri/shared/design-system + react-component-architecture
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Adding a new capability to a compound layout primitive that already has multiple Roots sharing one base context
  - Introducing axis-asymmetric behavior (e.g., column-only spanning) on top of a scalar clamp utility that bounds multiple axes simultaneously
  - Tempted to replace a scalar context field with a wider type, or to split a single resolver into per-axis variants
  - Working in a codebase where the React skill mandates compound components with a shared Provider
related_components:
  - frontend_stimulus
  - testing_framework
tags:
  - react
  - compound-components
  - layout-primitive
  - context-evolution
  - css-grid
  - tilegrid
  - additive-types
---

# Evolving a shared-context layout primitive without breaking existing Roots

## Context

Tilegrid was designed with three sibling Roots (`TilegridScrollRoot`, `TilegridPagedRoot`, `TilegridRailRoot`) sharing a single base context (`TilegridBaseContext<T>`) and one cell atom (`TilegridCells`) that reads the context. The pattern is documented in `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md`.

The Switch-style home-rail exploration needed two new capabilities **on the rail Root only**:

1. **Rectangular cells.** `cellSize: number | string` (square only) needed to also accept `{ width, height }` so a single rail cell can be a 2:3 portrait poster (≈155×220) instead of a square.
2. **Per-item column spans.** A "feature" tile needed to occupy N column-widths in the rail's single row, without that span also expanding the row axis the way it does for scroll/paged.

Both changes had to land without breaking the scroll Root, the paged Root, the cells atom, the existing test suite, or any consumer passing `cellSize: number | string` today. The temptation in each case was to make a "cleaner" but wider change that would force coordinated edits across the whole primitive family. Resisting that temptation produced four small, transferable moves.

A constraint worth naming: the existing `clampSpan(rawSpan, maxSpan)` utility was a **scalar** clamp — it took one span and bounded it against both `maxSpan.columns` AND `maxSpan.rows` simultaneously. This is correct for square scroll/paged spans (an N-span tile is N×N cells, both axes share the same span). It actively conflicts with column-only spanning, where the span should bound columns and ignore rows.

## Guidance

Four moves, applied together. None are Tilegrid-specific.

### 1. Extend the shared context additively, not by replacing scalars

When a Root needs to publish information no other Root has, add an **optional** field to the base context. Do not replace existing scalar fields with wider types just because one Root could benefit from the wider shape.

```ts
// Before — single scalar
export interface TilegridBaseContext<T> {
  readonly cellSize: number
  readonly maxSpan: { columns: number; rows: number }
  // ...
}

// After — additive, with the existing scalar preserved
export interface TilegridBaseContext<T> {
  readonly cellSize: number
  /**
   * Optional rectangular cell size. Published only by Roots that lay
   * out non-square cells (today: rail mode with cellSize: { width, height }).
   * Square Roots leave this undefined; consumers should fall back to
   * cellSize when this is absent. When present, cellSizeRect.width === cellSize.
   */
  readonly cellSizeRect?: { width: number; height: number }
  /**
   * Optional span-axis hint. Defaults to "both" when absent (existing
   * behavior). "column-only" instructs the cell atom to clamp the row
   * axis to 1 regardless of the resolved span.
   */
  readonly spanAxis?: "both" | "column-only"
  readonly maxSpan: { columns: number; rows: number }
  // ...
}
```

The wider alternative — replacing `cellSize: number` with `cellSize: { width, height }` everywhere — would have forced a coordinated edit across `TilegridScrollRoot`, `TilegridPagedRoot`, `TilegridCells`, and every test asserting on the context value. The additive shape touches one type and one Root.

### 2. Use established unbounded-axis sentinels instead of fighting scalar utilities

When a scalar utility (like `clampSpan`) bounds against multiple axes and you need axis-asymmetric behavior, **set the irrelevant axis to the sentinel the utility already understands** rather than rewriting the utility.

`clampSpan` was already designed to treat `Infinity` as "unbounded on this axis" — scroll mode publishes `maxSpan: { columns, rows: Infinity }` for that reason. So rail's column-only spanning naturally publishes:

```ts
// Rail Root publishes:
maxSpan: {
  columns: Math.max(1, items.length),
  rows: Number.POSITIVE_INFINITY,
}
```

`clampSpan(rawSpan, maxSpan)` then returns `min(rawSpan, items.length, Infinity)` = `min(rawSpan, items.length)`. The column clamp is the only effective bound. The scalar utility doesn't change, doesn't grow an `axis` parameter, doesn't get split into `clampColumnSpan` / `clampRowSpan`. The existing test that asserts `clampSpan(5, { columns: 8, rows: Infinity }) === 5` still passes — and now also documents the contract for rail mode.

The temptation is to "fix" `clampSpan` to take an axis parameter, or to use a "very large number" instead of `Infinity` to avoid an explicit axis concept. Both are worse:
- Adding an axis parameter forces every caller to pass it, and inflates the API for one new caller's benefit.
- A "very large number" works numerically but loses the semantic signal that says "this axis is unbounded by design."

### 3. Push axis-asymmetric rendering decisions into the consuming atom via a context flag

The row-axis clamp to 1 in column-only mode does NOT belong in `clampSpan` (which would inflate its API), and it does NOT belong as a split resolver (`getColumnSpan` / `getRowSpan`, which doubles the function surface). It belongs in the **single place that turns a span into CSS**: the cell atom.

```tsx
// In TilegridCells, after clampSpan:
const span = clampSpan(getSpan(item), maxSpan)
// Rail mode publishes spanAxis: "column-only" so a multi-column tile
// stays in the rail's single row. Scroll/paged Roots leave spanAxis
// undefined (default "both"), preserving square N×N spans.
const rowSpan = spanAxis === "column-only" ? 1 : span
const style = {
  gridColumn: `span ${span}`,
  gridRow:    `span ${rowSpan}`,
  // ...
}
```

The cell atom is already the place where `clampSpan` is called and where `gridColumn` / `gridRow` styles are emitted. The axis decision lives one ternary deep, gated on a context flag the producing Root publishes. Scroll and paged Roots leave `spanAxis` undefined and inherit the existing `"both"` behavior with zero code change.

### 4. Document shadow fields with a "prefer this" JSDoc

When you add a wider field that overlaps with an existing scalar (here, `cellSizeRect.width === cellSize` in rectangular mode), the two fields can drift in future edits — someone reads the scalar, doesn't realize the new field is the canonical source, and writes code that fails when rectangular mode is in use.

Block drift before it starts with a JSDoc directive on the shadowed field:

```ts
/**
 * Cell base size as resolved CSS pixels.
 *
 * When `cellSizeRect` is published (rail rectangular mode), prefer reading
 * from it; `cellSize` is its `width` for backward read-compat.
 */
readonly cellSize: number
```

This is cheaper than deprecating the scalar (which would force a coordinated migration across all readers) and more honest than silently letting the scalar mean different things in different modes. It also gives the next agent doing a read-only consumer audit a one-line guide.

## Why This Matters

- **Smaller blast radius.** Every additive optional field is a no-op for Roots that don't publish it and consumers that don't read it. The four-commit landing of rectangular rail cells did not edit `TilegridScrollRoot`, `TilegridPagedRoot`, the context tests, scroll tests, or paged tests. Their behavior and test coverage are demonstrably unchanged.
- **Utility contracts stay portable.** `clampSpan` keeps its scalar shape and its existing test suite. Future Roots that need column-only or row-only spanning use the same `Infinity` sentinel pattern without growing the utility's API. The pattern compounds.
- **The atom stays the only renderer.** Resisting the urge to split `getSpan` keeps the cell atom as the single place that turns context into CSS. New axis-asymmetric Roots add a new `spanAxis` value and the atom's switch grows by one branch. Splitting the resolver would have spread the rendering decision across the resolver, the atom, and the Root.
- **Shadow-field JSDoc replaces would-be future bugs.** A read of `base.cellSize` in rectangular mode now has a one-line warning attached, exactly where a developer would land. No deprecation cycle, no migration sweep.
- **The pattern is platform-shaped, not Tilegrid-shaped.** "Additive optional context fields gated by Root", "scalar utilities + sentinel values for unbounded axes", and "axis-asymmetric rendering in the consuming atom" all generalize to any compound primitive built on the same foundation: a shared Provider, multiple Roots, and a single rendering atom. They apply unchanged to a future virtualized Root, masonry Root, or any primitive sharing this shape.

## When to Apply

- Adding a capability to a compound layout primitive that lives on **only some** of its Roots, where the existing context shape is shared by all of them.
- Adding **axis-asymmetric** behavior (column-only, row-only, single-axis, transposed) on top of a scalar utility that today treats both axes uniformly.
- Tempted to rewrite a shared utility to handle a one-off Root's needs — or to split a single resolver into per-axis variants.
- Tempted to widen an existing scalar context field "for cleanliness" when only one Root benefits from the wider shape.
- The new capability would otherwise force coordinated test edits across every Root and the cell atom.

## Examples

### Move 1 — Additive context evolution (the diff that landed)

```diff
 export interface TilegridBaseContext<T extends GridItemShape> {
   readonly cellSize: number
+  /**
+   * Optional rectangular cell size as resolved CSS pixels. Published only
+   * by Roots that lay out non-square cells. Square Roots leave it undefined.
+   * When present, cellSizeRect.width === cellSize for backward read-compat.
+   */
+  readonly cellSizeRect?: { width: number; height: number }
   readonly gap: number
   readonly columns: number
   readonly maxSpan: { columns: number; rows: number }
+  /**
+   * Optional span-axis hint. Defaults to "both". "column-only" pins the
+   * row axis to 1 in TilegridCells regardless of the resolved column span.
+   */
+  readonly spanAxis?: "both" | "column-only"
 }
```

Two optional fields. Zero changes to scroll/paged Roots, their test suites, or any consumer reading `cellSize`/`maxSpan` directly.

### Move 2 — `Infinity` sentinel instead of fighting the scalar clamper

```ts
// Rail Root, base context publication:
maxSpan: {
  columns: Math.max(1, items.length),
  // The row axis is unbounded by clampSpan because the row-axis pin to 1
  // lives in TilegridCells (gated by spanAxis: "column-only" below) rather
  // than in clampSpan's scalar contract.
  rows: Number.POSITIVE_INFINITY,
},
spanAxis: "column-only",
```

`clampSpan` is unchanged. The existing scroll-mode test (`clampSpan(5, { columns: 8, rows: Infinity }) === 5`) now doubles as the documentation for the rail-mode contract.

### Move 3 — Axis flag in the atom, not split resolvers

```diff
 export function TilegridCells<T>(...) {
-  const { items, getKey, getSpan, getAriaLabel, maxSpan } = base
+  const { items, getKey, getSpan, getAriaLabel, maxSpan, spanAxis } = base

   return items.map(item => {
     const span = clampSpan(getSpan(item), maxSpan)
+    // Rail mode publishes spanAxis: "column-only" so a multi-column tile
+    // stays in the rail's single row. Scroll/paged Roots leave spanAxis
+    // undefined (default "both"), preserving square N×N spans.
+    const rowSpan = spanAxis === "column-only" ? 1 : span
     const style = {
       gridColumn: `span ${span}`,
-      gridRow:    `span ${span}`,
+      gridRow:    `span ${rowSpan}`,
       // ...
     }
     // ...
   })
 }
```

One destructured field, one ternary, one style change. The resolver `getSpan` stays a single function. The Root publishes the flag. The atom honors it.

### Move 4 — JSDoc on the shadowed scalar

```ts
/**
 * Cell base size as resolved CSS pixels. The Root prop accepts either a
 * number or any CSS `<length>` string; this context field is always the
 * runtime-resolved pixel value (or `0` while a string input is still
 * being measured).
 *
 * When `cellSizeRect` is published (rail rectangular mode), prefer reading
 * from it; `cellSize` is its `width` for backward read-compat.
 */
readonly cellSize: number
```

Future readers searching `useTilegrid().base.cellSize` land on the warning before they write a consumer that breaks under rectangular cells.

### What we explicitly did not do

- **Did not** add a `mode: "rail" | "scroll" | "paged"` prop to a unified Root. The two-Root composition pattern is documented in `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md`.
- **Did not** replace `cellSize: number` with `cellSize: { width, height }` everywhere. That would have churned the scroll/paged Roots, their tests, and every consumer.
- **Did not** add an `axis` parameter to `clampSpan`. The scalar contract stayed intact; the `Infinity` sentinel did the work.
- **Did not** split `getSpan` into `getColumnSpan` / `getRowSpan`. The atom got one new context-flag branch instead.
- **Did not** introduce a per-tile aspect override on items themselves. Tile aspect stays "cell shape × span" — still derived, not declared. (See thinking-partner discussion in the originating session: per-tile aspect is a separate architectural move that pulls tiles out of the cell-grid mental model entirely, and is only justified when the product genuinely demands mixed aspects in one row.)

## Related

- `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md` — the original Tilegrid design pattern. This doc is its evolution counterpart: the first explains *how to design* multi-Root layout primitives; this one explains *how to grow* one without breaking it.
- `docs/solutions/best-practices/css-length-props-with-sentinel-resolution-2026-05-01.md` — the `useResolvedCSSLength` mechanism that the rectangular-cell change reused unchanged for both axes.
- `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md` — relevant background for the container-query-driven sizing the rectangular-cell API enables.
- `docs/plans/2026-04-30-009-feat-tilegrid-rail-heterogeneous-plan.md` — the plan and four-commit landing of the change this doc generalizes from.
- `~/.pi/packages/react/skills/react/SKILL.md` — the React skill that codifies the Provider-driven, no-boolean-controls-subtree pattern this evolution stays inside.
- Tilegrid file family: `korri/shared/primitives/components/Tilegrid/`
