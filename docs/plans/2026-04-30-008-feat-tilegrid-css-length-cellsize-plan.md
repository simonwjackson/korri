---
title: "feat: Tilegrid cellSize and gap accept CSS lengths with live resolution"
type: feat
status: completed
date: 2026-04-30
origin: docs/brainstorms/2026-04-30-tilegrid-css-length-cellsize-requirements.md
---

# feat: Tilegrid `cellSize` and `gap` accept CSS lengths with live resolution

## Overview

Widen the Tilegrid Root prop types so consumers can author `cellSize` and
`gap` in any CSS length (`rem`, `em`, `vw`, `%`, `var(...)`, `calc(...)`,
etc.) instead of just numeric pixels. Strings are resolved live at runtime
via a hidden DOM sentinel observed by `ResizeObserver` mounted inside the
Root, so theme switches, accessibility zoom, and viewport-driven units stay
correct without remounting. Numeric inputs continue to skip the sentinel
entirely so existing call sites pay nothing.

The change is non-breaking: `number` remains a valid input on every Root,
and the published context still exposes resolved pixels under the existing
`cellSize: number` / `gap: number` shape.

## Problem Frame

Current Tilegrid Roots type both `cellSize` and `gap` as `number` (pixels)
and embed the value directly into CSS template strings (`${cellSize}px`)
and JS layout math (column count for scroll, columns + rows for paged).
Themes in this project author sizing in `rem` and CSS variables, so tile
sizing has to either be re-derived per theme into pixel numbers or live
outside the rest of the design-system token surface. The user has confirmed
the resolved value can change at runtime (theme switch, zoom), which means
JS-side math must track CSS-driven changes — not snapshot at mount.

`TilegridScrollRoot` and `TilegridPagedRoot` need resolved pixels for column
and row math; `TilegridRailRoot` performs no math and only needs the value
in CSS, so it benefits for free.

(see origin: `docs/brainstorms/2026-04-30-tilegrid-css-length-cellsize-requirements.md`)

## Requirements Trace

- R1. `cellSize: number | string` accepted on all three Roots.
- R2. `gap: number | string` accepted on all three Roots; default stays `8`.
- R3. Numeric inputs remain non-breaking; existing call sites and tests keep working unchanged.
- R4. String inputs are resolved to pixels via a hidden sentinel + `ResizeObserver`, mounted inside the Root so the cascade resolves correctly.
- R5. Resolution updates live across runtime CSS changes (root font-size, theme variables, viewport units, container queries).
- R6. Numeric inputs are zero-cost — no sentinel, no observer.
- R7. CSS template strings consume the original input verbatim (number → `${n}px`, string → passthrough), so the visual layout reflects exactly what the consumer authored.
- R8. `TilegridBaseContext.cellSize` / `gap` continue to expose **resolved pixels** as `number`. Consumer-facing context contract is unchanged.
- R9. Pre-resolution fallback is `columns: 1` (and `rows: 1` for paged), matching the existing first-paint behavior of `useContainerSize`.
- R10. Existing unit tests pass unchanged.
- R11. New tests cover: numeric path renders no sentinel; string path mounts a sentinel with the original CSS expression; resolved px is published in context once measured; pre-resolution fallback is `columns: 1`.
- R12. The existing `_testColumns` / `_testRows` escape hatches on `TilegridPagedRoot` continue to bypass measurement.

## Scope Boundaries

- Not changing the layout model. Scroll stays CSS dense; paged stays bin-packed; rail stays single-row.
- Not introducing per-cell CSS lengths. All cells in a Root share one resolved size.
- Not adding a separate `cellSizePx` prop or dual-prop API.
- Not exposing the original CSS expression in context. Consumers reading `useTilegrid()` get resolved pixels only.
- Not adding a debounce on resolution updates.
- Not designing a generic theme-token resolver. CSS already resolves rem/var/calc; Tilegrid only measures the result.

### Deferred to Separate Tasks

- *(none)*

## Context & Research

### Relevant Code and Patterns

- `korri/shared/design-system/lib/useContainerSize.ts` — existing `ResizeObserver`-backed hook the new hook should mirror in shape and lifecycle.
- `korri/shared/design-system/components/Tilegrid/TilegridScrollRoot.tsx` — column derivation via `Math.floor((width + gap) / (cellSize + gap))`, CSS template uses `${cellSize}px` and `${gap}px`.
- `korri/shared/design-system/components/Tilegrid/TilegridPagedRoot.tsx` — same math for both columns and rows; carries `_testColumns` / `_testRows` escape hatches that must continue to work.
- `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.tsx` — no JS math; only feeds CSS, so widening is mechanical.
- `korri/shared/design-system/components/Tilegrid/Tilegrid.context.tsx` — `TilegridBaseContext.cellSize: number` and `gap: number` (resolved px contract).
- `korri/shared/design-system/components/Tilegrid/components/TilegridCells.tsx` — reads `maxSpan` from context; depends on `columns` being correct after resolution.
- `korri/shared/design-system/components/Tilegrid/Tilegrid.stories.tsx` — Storybook playground; existing controls panel structure to follow when adding a string-cellSize demonstration.

### Institutional Learnings

- `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md` — confirms each Root owns its layout state; do not introduce a shared mode prop.
- `docs/solutions/best-practices/control-driven-storybook-coverage-for-combinatorial-components-2026-05-01.md` — extend Storybook controls rather than adding new fixed-variant stories.

### External References

- *(none — well-patterned local change; no external research run.)*

## Key Technical Decisions

- **String + number, not string-only.** Numbers stay zero-cost so existing call sites pay nothing for a feature they don't use.
- **Sentinel-based measurement, not `getComputedStyle` parsing.** Sentinels work uniformly for `rem`, `var(...)`, `calc(...)`, `%`, viewport units, and container-query units. `getComputedStyle` of a non-`width`/`height` property returns the *specified* value (e.g. literal `"6rem"`), not resolved pixels.
- **One sentinel per resolved length, mounted inside the Root.** Mounting inside the Root preserves the cascade so theme variables and font-size on intermediate ancestors resolve correctly. Two separate sentinels (one for `cellSize`, one for `gap`) when both are strings — simpler than packing two values into one node.
- **Sentinel sized via `width`, height set to 0.** A 0-height absolutely-positioned, visibility-hidden node measures the CSS length without taking layout space and without affecting grid placement.
- **Resolved px published in context.** Keeps the consumer-facing contract unchanged.
- **Live tracking via `ResizeObserver`.** Origin doc confirms runtime correctness is required across theme switches and zoom.
- **Pre-resolution fallback: `columns: 1` (and `rows: 1` paged).** Reuses the existing `useContainerSize` first-paint behavior so the contract is consistent.
- **Hook lives in `korri/shared/design-system/lib/useResolvedCSSLength.ts`.** Mirrors `useContainerSize.ts` placement; shared because all three Roots use it.
- **Rail Root short-circuits the hook for the math path** (no math), but still uses it indirectly only to pass strings through to CSS — i.e., Rail doesn't render a sentinel at all.

## Open Questions

### Resolved During Planning

- **Where should the resolution hook live?** → `korri/shared/design-system/lib/useResolvedCSSLength.ts`, alongside `useContainerSize.ts`.
- **Should we add a Playwright component spec for end-to-end resolution?** → No. `happy-dom` cannot resolve `rem` / CSS variables, but unit tests can verify that the sentinel is rendered with the expected CSS expression and that resolution flows through context once a numeric measurement arrives. End-to-end correctness is validated via Storybook visual review. Skip Playwright for this change.
- **Should context JSDoc be widened?** → Yes; clarify that `cellSize` and `gap` on `TilegridBaseContext` are always resolved pixels regardless of the Root prop input type.

### Deferred to Implementation

- **Exact sentinel default styles.** Inline styles vs. a small CSS class — pick during implementation; either works. Prefer inline styles to match the rest of Tilegrid's "no stylesheet" posture.
- **Whether to expose a `_testResolvedCellSizePx` escape hatch.** Decide once string-path tests are written. The existing `_testColumns` / `_testRows` may already cover paged-mode coverage; the scroll Root currently has no escape hatch and may not need one for this change.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
TilegridScrollRoot / TilegridPagedRoot
├── outer wrapper (ref'd by useContainerSize)
│   ├── (string-input only) <span ref> — sentinel sized to `cellSize` CSS
│   ├── (string-input only) <span ref> — sentinel sized to `gap` CSS
│   └── inner grid
│       ├── gridTemplateColumns: repeat(columns, <cellSizeCSS>)
│       ├── gridAutoRows / gridTemplateRows: <cellSizeCSS>
│       ├── gap: <gapCSS>
│       └── children (TilegridCells, ...)
│
│   columns = floor((containerWidth + gapPx) / (cellSizePx + gapPx))
│   where:
│     cellSizePx = useResolvedCSSLength(cellSize)   // number → pass-through
│     gapPx      = useResolvedCSSLength(gap)        // string → sentinel
│     cellSizeCSS = `${cellSize}px` if number else cellSize
│     gapCSS      = `${gap}px`      if number else gap
```

`useResolvedCSSLength(value: number | string)` returns:
- `resolvedPx: number | null` — `value` itself when number; sentinel-measured px when string; `null` until first measurement
- `cssValue: string` — `${value}px` when number; raw string when string
- `ref: RefObject` — bind to the sentinel (only meaningful when `value` is a string; numeric branch returns a no-op ref)

Roots conditionally render the sentinel only on the string branch. Numeric inputs short-circuit the hook to a constant tuple — no `useEffect`, no observer, no DOM.

## Implementation Units

- [x] **Unit 1: `useResolvedCSSLength` hook** — committed in `5cad8e6`

**Goal:** Add a shared hook that accepts `number | string`, returns the value as resolved pixels (live for strings, identity for numbers) plus the CSS expression to embed in inline styles, plus a ref to attach to a sentinel element.

**Requirements:** R4, R5, R6, R7, R9

**Dependencies:** none

**Files:**
- Create: `korri/shared/design-system/lib/useResolvedCSSLength.ts`
- Test: `korri/shared/design-system/lib/useResolvedCSSLength.test.ts`

**Approach:**
- Public shape: `useResolvedCSSLength(value: number | string) -> { resolvedPx: number | null; cssValue: string; ref: React.RefObject<HTMLElement | null> }`.
- Numeric branch: return `{ resolvedPx: value, cssValue: \`${value}px\`, ref }` where `ref` is created but unused. No effect, no observer.
- String branch: state holds `resolvedPx: number | null` initialized to `null`. `useEffect` reads `getBoundingClientRect().width` once after mount, then attaches a `ResizeObserver` that updates state on every entry. Cleanup disconnects.
- Effect dependency includes the input value so the observer re-runs when the input string changes (e.g., dataset arg in Storybook).
- Mirror `useContainerSize` lifecycle for consistency.

**Patterns to follow:**
- `korri/shared/design-system/lib/useContainerSize.ts` — same `ResizeObserver` lifecycle, same ref+state shape.

**Test scenarios:**
- Happy path: numeric input returns `{ resolvedPx: <input>, cssValue: "<input>px" }` synchronously and renders no observer activity.
- Happy path: string input returns `cssValue` equal to the input string and `resolvedPx: null` before any measurement is fed in.
- Edge case: when input switches from number to string between renders, the hook transitions correctly (resolvedPx returns to null until measurement, cssValue swaps to raw string).
- Edge case: when input switches from string to number between renders, the hook returns the new number synchronously and the observer is disconnected.
- Integration: bind the ref to a real DOM node, dispatch a `ResizeObserver`-style entry through a fake observer (or simulate via direct state update path) to confirm `resolvedPx` updates when the sentinel is measured. If `happy-dom` cannot drive `ResizeObserver` reliably, assert the effect attaches and detaches an observer instance and that the numeric path takes the synchronous branch.

**Verification:**
- New unit tests pass.
- `just typecheck` passes.
- Hook does not log, throw, or schedule work on the numeric path.

- [x] **Unit 2: Widen `TilegridRailRoot` to accept CSS lengths** — committed in `e006a51`

**Goal:** Smallest consumer of the new API. Accept `number | string` for `cellSize` and `gap`, normalize for CSS output, no math changes (Rail has no JS math).

**Requirements:** R1, R2, R3, R7

**Dependencies:** Unit 1 (only for type symmetry; Rail does not actually call the hook)

**Files:**
- Modify: `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.tsx`
- Test: `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.test.tsx`

**Approach:**
- Widen `cellSize` and `gap` prop types to `number | string`.
- Inline-normalize for CSS: `const cellSizeCSS = typeof cellSize === "number" ? \`${cellSize}px\` : cellSize` (and `gapCSS` likewise).
- Use `cellSizeCSS` / `gapCSS` in the inline `style` block (`gridAutoColumns`, `gridTemplateRows`, `gap`).
- Context still publishes a numeric `cellSize` / `gap`. For Rail there is no JS math, but the context contract requires a `number`. Two options:
  1. Resolve via `useResolvedCSSLength` for context purposes only and accept the (small) cost of mounting a sentinel even in Rail.
  2. Publish `cellSize` and `gap` as `0` when the input is a string (a Rail-specific opt-out, since no internal consumer uses these context fields in rail mode).
  Choose option 1 for contract honesty: a consumer reading `useTilegrid()` from inside a Rail shouldn't see `0` for the cell size. The cost is one extra DOM node + observer per Rail Root.

**Patterns to follow:**
- Existing `TilegridRailRoot.tsx` shape; do not change layout direction or maxSpan.

**Test scenarios:**
- Happy path: numeric `cellSize` and `gap` render the same CSS values as today (`gridAutoColumns: 120px`, `gap: 8px`).
- Happy path: string `cellSize="6rem"` renders `gridAutoColumns: 6rem` and `gridTemplateRows: 6rem`.
- Happy path: string `gap="0.5rem"` renders `gap: 0.5rem`.
- Edge case: when both are strings, both sentinels are rendered with their respective CSS expressions and are positioned/styled to be invisible (height 0, visibility hidden, position absolute).
- Edge case: numeric inputs render no sentinel.
- Integration: span clamping is unchanged (`maxSpan: { columns: 1, rows: 1 }`) regardless of input type.

**Verification:**
- All existing `TilegridRailRoot.test.tsx` tests still pass.
- New string-input tests pass.
- Visual review in Storybook: a rail with `cellSize="6rem"` renders correctly.

- [x] **Unit 3: Wire `TilegridScrollRoot` to `useResolvedCSSLength`** — committed in `b88de0c`

**Goal:** Replace direct numeric usage of `cellSize` / `gap` with the new hook so column count derivation tracks live resolution.

**Requirements:** R1, R2, R3, R4, R5, R7, R8, R9, R11

**Dependencies:** Unit 1

**Files:**
- Modify: `korri/shared/design-system/components/Tilegrid/TilegridScrollRoot.tsx`
- Test: `korri/shared/design-system/components/Tilegrid/TilegridScrollRoot.test.tsx`

**Approach:**
- Widen `cellSize: number | string` and `gap?: number | string` prop types.
- Call `useResolvedCSSLength(cellSize)` and `useResolvedCSSLength(gap)`.
- Render each sentinel only when its corresponding input is a string. Sentinels are siblings of the inner grid inside the outer scroll wrapper; styled to be position-absolute, visibility-hidden, height 0, and width set to the CSS expression. Use `aria-hidden="true"`.
- Column-count derivation reads `cellSizePx` and `gapPx` (resolved px from the hook). When either is `null`, fall back to `columns: 1`.
- CSS template strings use `cellSizeCSS` / `gapCSS` for `gridTemplateColumns`, `gridAutoRows`, and `gap`.
- Context publishes the resolved px (use `cellSizePx ?? 0` and `gapPx ?? 0` for the `null` window — match `columns: 1` fallback semantics).

**Patterns to follow:**
- Existing `TilegridScrollRoot.tsx` outer-wrapper / inner-grid structure.
- `useContainerSize` lifecycle for the outer wrapper (unchanged).

**Test scenarios:**
- Happy path: numeric `cellSize={100}` and `gap={8}` produce identical CSS to today (no behavioral change).
- Happy path: numeric inputs render no sentinel children inside the outer wrapper.
- Happy path: string `cellSize="6rem"` renders a sentinel with `width: 6rem` and uses `gridTemplateColumns: repeat(N, 6rem)` in the inner grid CSS.
- Edge case: pre-resolution (sentinel mounted but `resolvedPx` null) → `maxSpan.columns` is `1`; cells with `span: 2` clamp to `1`.
- Edge case: string `gap="0.5rem"` renders a second sentinel for gap; once both resolve, column derivation uses the resolved pixel values.
- Integration: with `asChild`, the inner grid is the consumer's slotted child but the sentinels still render as siblings inside the outer wrapper (no Slot conflict).

**Verification:**
- All existing `TilegridScrollRoot.test.tsx` tests pass.
- New string-input tests pass.
- `just typecheck` passes.
- Visual review in Storybook: scrolling grid with `cellSize="6rem"` resizes correctly when root font-size changes.

- [x] **Unit 4: Wire `TilegridPagedRoot` to `useResolvedCSSLength`** — committed in `a6e61c1`

**Goal:** Apply the same hook integration to paged mode so columns + rows + page composition track live resolution. Preserve the existing `_testColumns` / `_testRows` escape hatches.

**Requirements:** R1, R2, R3, R4, R5, R7, R8, R9, R11, R12

**Dependencies:** Unit 1

**Files:**
- Modify: `korri/shared/design-system/components/Tilegrid/TilegridPagedRoot.tsx`
- Test: `korri/shared/design-system/components/Tilegrid/TilegridPagedRoot.test.tsx`

**Approach:**
- Same pattern as Unit 3 for `cellSize` and `gap` widening.
- Sentinels rendered as siblings of the inner grid inside the outer wrapper.
- Both `columns` and `rows` derivation read resolved px; both fall back to `1` until the corresponding measurements arrive.
- `_testColumns` and `_testRows` continue to take precedence over the derived values — same control flow as today, just substituting resolved px for the original numbers in the non-test branch.
- Context publishes resolved px; `maxSpan` reflects the derived columns + rows.
- Re-pagination via `paginateItems` happens whenever resolved px changes (already keyed off `columns` and `rows` in the existing `useMemo`).

**Patterns to follow:**
- Existing `TilegridPagedRoot.tsx` derivation structure for `columns` and `rows`.
- Existing `_testColumns` / `_testRows` escape hatch.

**Test scenarios:**
- Happy path: numeric `cellSize` and `gap` reproduce all current behavior, including bin-packer output, currentPage state, and totalPages.
- Happy path: string `cellSize` renders a sentinel; pre-resolution, `totalPages: 1` and the only published page contains as many items as fit in a 1×1 grid (i.e., one item).
- Edge case: `_testColumns` / `_testRows` continue to pin layout regardless of input type — string `cellSize` does not interfere with the existing test path.
- Edge case: string `gap` produces a second sentinel; once both resolve, page composition matches numeric-equivalent inputs.
- Integration: with `asChild`, the slotted inner grid receives the resolved CSS template; sentinels live as siblings, not inside the Slot.

**Verification:**
- All existing `TilegridPagedRoot.test.tsx` tests pass.
- New string-input tests pass.
- `_testColumns` / `_testRows` continue to bypass measurement.
- `just typecheck` passes.
- Visual review in Storybook: paged grid with `cellSize="6rem"` re-pages correctly when root font-size changes.

- [x] **Unit 5: Documentation polish and Storybook demonstration** — committed in `4aef264`

**Goal:** Update the context JSDoc and Storybook playground so the new capability is discoverable and reviewable.

**Requirements:** R8, R11

**Dependencies:** Unit 2, Unit 3, Unit 4

**Files:**
- Modify: `korri/shared/design-system/components/Tilegrid/Tilegrid.context.tsx`
- Modify: `korri/shared/design-system/components/Tilegrid/TilegridScrollRoot.tsx` (JSDoc on `cellSize` / `gap`)
- Modify: `korri/shared/design-system/components/Tilegrid/TilegridPagedRoot.tsx` (JSDoc on `cellSize` / `gap`)
- Modify: `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.tsx` (JSDoc on `cellSize` / `gap`)
- Modify: `korri/shared/design-system/components/Tilegrid/Tilegrid.stories.tsx`

**Approach:**
- Context: clarify that `cellSize` and `gap` on `TilegridBaseContext` are resolved pixels regardless of how the corresponding Root prop was authored.
- Root JSDoc: document that `cellSize` and `gap` accept any CSS `<length>` and that strings are resolved live via an internal sentinel.
- Storybook: change the Controls panel `cellSize` control type so a user can submit either a number or a string. Either replace the numeric range with a `text` control (which then accepts `"6rem"` etc., parsed back to a number by callers when possible), OR add a parallel `cellSizeCSS?: string` arg that, when set, takes precedence over the numeric `cellSize` arg in the demo wrappers.
- Pick the option that keeps the existing Playground / FramerMotion / ViewTransitions controls working without regression (the parallel-arg approach is safer; the range slider stays useful for numeric exploration).

**Patterns to follow:**
- `docs/solutions/best-practices/control-driven-storybook-coverage-for-combinatorial-components-2026-05-01.md` — extend controls, do not add fixed-variant stories.

**Test scenarios:**
- Test expectation: none — JSDoc and Storybook arg-type changes are not behavioral. Visual review is the validation.

**Verification:**
- `just typecheck` passes.
- Storybook renders the playground with the new control; selecting a string value (e.g., `cellSizeCSS="6rem"`) produces a visibly different grid.
- Existing Storybook E2E specs still pass.

## System-Wide Impact

- **Interaction graph:** Three Roots wire the new hook the same way; one shared hook publishes resolved pixels. `TilegridCells` reads `maxSpan` from context — its behavior is unchanged because it sees the same resolved numeric contract.
- **Error propagation:** No new error paths. A string that resolves to `0` (e.g., `var(--undefined)`) flows through math as a `1`-column fallback rather than throwing.
- **State lifecycle risks:** Sentinel mount + observer attach happens in `useEffect`. Cleanup must disconnect the observer to avoid leaks across rapid prop changes (string ↔ string, string ↔ number).
- **API surface parity:** All three Roots get the same prop widening. Public TS surface stays consistent.
- **Integration coverage:** Cross-layer behavior — Root resolves pixels → context publishes resolved px → `TilegridCells` clamps spans — must be covered by at least one integration test per Root that asserts span clamping under a string input.
- **Unchanged invariants:** `TilegridBaseContext` field types, `paginateItems` API, mode-as-composition (separate Roots per mode), `asChild` slot semantics, view-transition-name resolver, and `onItemClick` wiring all remain unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `happy-dom` does not resolve `rem` or compute layout for sentinels, so unit tests cannot assert resolved pixel values | Tests assert sentinel rendering and CSS expressions; resolved-px assertions feed off mocked or simulated observer entries; visual validation lives in Storybook |
| Sentinel inside the outer wrapper interferes with grid layout | Sentinels are absolutely positioned, visibility-hidden, height 0, `aria-hidden="true"`, and rendered as siblings of (not inside) the inner grid container |
| ResizeObserver fires repeatedly on theme animations causing layout thrash | Math is cheap; existing `useContainerSize` already runs the same observer pattern; defer debounce until measured pain emerges |
| Consumers passing a string `cellSize` that resolves to `0` (e.g., undefined CSS variable) silently degrade to one-column layout | Documented behavior in JSDoc; matches existing zero-width container behavior; surfacing a runtime warning is out of scope |
| Slot.Root + sentinel interaction when `asChild` is used | Sentinels render as siblings of the slotted grid, not inside it; verified via integration tests in Units 3 and 4 |

## Documentation / Operational Notes

- Update JSDoc on Roots and `TilegridBaseContext` (Unit 5).
- No external docs, runbooks, or rollout notes needed.
- No feature flag — non-breaking widening; ship as part of normal release.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-30-tilegrid-css-length-cellsize-requirements.md](../brainstorms/2026-04-30-tilegrid-css-length-cellsize-requirements.md)
- Related code: `korri/shared/design-system/components/Tilegrid/`, `korri/shared/design-system/lib/useContainerSize.ts`
- Related plans: [2026-04-30-005 Tilegrid primitive consolidation](2026-04-30-005-refactor-tilegrid-primitive-consolidation-plan.md), [2026-04-30-007 Tilegrid animation seams](2026-04-30-007-feat-tilegrid-animation-seams-plan.md)
- Related learnings: `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md`, `docs/solutions/best-practices/control-driven-storybook-coverage-for-combinatorial-components-2026-05-01.md`
