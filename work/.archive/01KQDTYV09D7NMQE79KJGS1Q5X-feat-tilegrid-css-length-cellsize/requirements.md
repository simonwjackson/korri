---
date: 2026-04-30
topic: tilegrid-css-length-cellsize
---

# Tilegrid `cellSize` / `gap` as CSS Lengths

## Problem Frame

`TilegridScrollRoot`, `TilegridPagedRoot`, and `TilegridRailRoot` accept
`cellSize: number` and `gap?: number`, both interpreted as CSS pixels. Themes
in this project author sizing in `rem` and CSS variables (design-system
tokens). To keep tile sizing consistent with the rest of the design system —
and to support runtime changes such as theme switches and accessibility zoom
that mutate the resolved pixel value — Tilegrid Roots must accept any valid
CSS length, not just numbers.

The constraint that complicates this: two of the three Roots run JS layout
math against `cellSize` and `gap`. `TilegridScrollRoot` derives the column
count from `(containerWidth + gap) / (cellSize + gap)`. `TilegridPagedRoot`
derives both columns and rows the same way to drive its bin-packer. Both
publish `maxSpan` into context; `TilegridCells` clamps spans against it.
Without resolved pixel values, span clamping and pagination silently break.

`TilegridRailRoot` performs no JS math — `cellSize` and `gap` only feed CSS
`gridAutoColumns`, `gridTemplateRows`, and `gap`.

## Requirements

**Public API**

- R1. `cellSize` accepts `number | string` on all three Roots. Numbers mean CSS pixels (current behavior). Strings are any valid CSS `<length>` — `rem`, `em`, `vw`, `vh`, `%`, `var(...)`, `calc(...)`, etc.
- R2. `gap` accepts `number | string` on all three Roots, with the same semantics. Default remains `8` (number).
- R3. Existing call sites that pass numbers continue to work without change. The change is a non-breaking widening of the prop type.

**Resolution Behavior**

- R4. When a string is provided for `cellSize` or `gap`, the Root resolves it to a runtime pixel value by measuring a hidden DOM sentinel sized to that CSS length, observed by `ResizeObserver`, mounted inside the Root so it inherits the same cascade (root font-size, CSS variables, container queries) as the grid.
- R5. The resolved pixel value updates live: when root font-size, theme variable, viewport unit, or any other CSS-resolved input changes, the Root re-derives `columns` (and `rows`, in paged mode) and re-publishes `maxSpan` and any paged page composition from the new resolved size.
- R6. When a number is provided, no sentinel is mounted and no observer is created — the number is used directly. Numeric `cellSize` and `gap` are zero-cost.

**CSS Output**

- R7. CSS template strings consume the original value verbatim: numbers as `${n}px`, strings passed through unchanged. The grid renders in the consumer's chosen units, so live CSS-driven scaling (rem/var/vw) animates the visual layout the same way the rest of the consumer's themed UI does.

**Context Contract**

- R8. `TilegridBaseContext.cellSize` and `TilegridBaseContext.gap` continue to be typed as `number` and to expose **resolved pixels**. Consumers reading the context get a usable numeric value regardless of how the prop was authored.
- R9. While a string-valued `cellSize` is unresolved (initial render before the sentinel measures), the Root falls back to publishing `columns: 1` and clamping spans to 1 — matching the existing first-paint behavior of `useContainerSize` for unmeasured outer wrappers.

**Test Surface**

- R10. Existing unit tests pass unchanged.
- R11. New tests cover: number path remains zero-DOM; string path mounts a sentinel with the original CSS expression; resolved pixel value is published in context; pre-resolution fallback is `columns: 1`.
- R12. The test escape-hatch props on `TilegridPagedRoot` (`_testColumns`, `_testRows`) continue to bypass measurement.

## Success Criteria

- A consumer can write `cellSize="6rem"` (or `cellSize="var(--tile-size)"`) on any Tilegrid Root and have the grid render correctly with span clamping and pagination intact.
- Changing the root font-size, theme CSS variables, or viewport at runtime causes the grid to re-derive its column count, row count (paged), and span clamps without remounting.
- Numeric `cellSize` consumers see no behavioral change and no measurable performance regression (no sentinel, no observer).

## Scope Boundaries

- Not changing the layout model. Scroll stays CSS dense; paged stays bin-packed; rail stays single-row.
- Not introducing per-cell CSS lengths (e.g. one tile in `rem`, another in `vw`). All cells in a Root share one resolved size.
- Not adding a separate `cellSizePx` prop or dual-prop API. One prop, one accepted shape.
- Not exposing the original CSS expression in context. Consumers reading `useTilegrid()` get resolved pixels only.
- Not adding a debounce on resolution updates. ResizeObserver fires per frame at most; the existing layout math is cheap.
- Not designing a generic theme-token resolver. CSS already resolves rem/var/calc; Tilegrid just measures the result.

## Key Decisions

- **String + number, not string-only.** Numbers stay zero-cost so existing call sites pay nothing for a feature they don't use.
- **Sentinel-based measurement, not `getComputedStyle` parsing.** Sentinels work uniformly for `rem`, `var(...)`, `calc(...)`, `%`, viewport units, and container-query units. `getComputedStyle` of a non-`width`/`height` property returns the *specified* value (e.g. literal `"6rem"`), not resolved pixels.
- **One sentinel per resolved length, mounted inside the Root.** Mounting inside the Root preserves the cascade so theme variables and font-size on intermediate ancestors resolve correctly. One sentinel for `cellSize`, one for `gap` when each is a string.
- **Context publishes resolved px, never the raw input.** Keeps the consumer-facing contract simple and unchanged.
- **Live tracking via `ResizeObserver`, not one-shot.** The user explicitly wants runtime correctness across theme switches and zoom; one-shot would silently go stale.
- **Rail Root supports strings without measurement.** No JS math means no resolution work — a near-free win.

## Dependencies / Assumptions

- `ResizeObserver` is available. Already used elsewhere in the design system (`useContainerSize`).
- `happy-dom` (the bun-test environment) does not faithfully resolve `rem` or layout sentinels. Tests asserting resolved pixel values will need to either run under a real browser layer (Playwright component test) or be limited to verifying the sentinel is mounted with the expected CSS expression.

## Outstanding Questions

### Resolve Before Planning

- *(none — product behavior is fully specified)*

### Deferred to Planning

- [Affects R4][Technical] Where should the shared resolution hook live? Likely `korri/shared/design-system/lib/useResolvedCSSLength.ts`, mirroring the placement of `useContainerSize`. Confirm during planning.
- [Affects R10, R11][Technical] Whether to add a Playwright component spec to assert end-to-end resolution under real layout, or rely on unit tests that only assert the sentinel is rendered with the expected CSS string.
- [Affects R8][Technical] Whether to widen the JSDoc on `TilegridBaseContext.cellSize` / `gap` to clarify "resolved pixels regardless of prop input type", or leave it implicit.

## Next Steps

-> `/ce:plan` for structured implementation planning
