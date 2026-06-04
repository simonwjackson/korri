---
title: CSS-length props with live sentinel resolution for primitives that need JS layout math
date: 2026-05-01
category: best-practices
module: korri/shared/design-system
problem_type: best_practice
component: design_system
severity: medium
applies_when:
  - Designing a layout primitive that accepts size-like props (`cellSize`, `rowHeight`, `gutter`, etc.)
  - The primitive runs JS-side layout math against those sizes (column count, row count, page composition, span clamping)
  - Consumers want to author sizes in design-system units (`rem`, `var(--token)`, `clamp(...)`) instead of hardcoded pixels
  - The resolved value must track runtime CSS changes (theme switch, root font-size, accessibility zoom, container-query units) without remounting
related_components:
  - frontend_stimulus
  - documentation
tags:
  - design-system
  - css-length
  - resize-observer
  - rem
  - theme-tokens
  - container-queries
  - layout-primitive
  - fluid-design
---

# CSS-length props with live sentinel resolution

## Context

A design-system primitive sometimes needs a numeric pixel value to do its job — column count derived from container width and cell size, page composition via a bin-packer, span clamping against a max — even though consumers want to author sizing in `rem`, `var(--token)`, or `clamp(...)` to stay consistent with the rest of the design system.

Two unsatisfying options:

- **Force consumers to pre-resolve.** Have the consumer compute pixels from theme tokens themselves and hand the primitive a number. Breaks composability, defeats the design system, and goes stale on theme switches.
- **Skip JS math entirely.** Switch to CSS-only patterns like `grid-template-columns: repeat(auto-fit, minmax(...))`. Works for simple grids but loses uniform cells, span clamping, and paged layouts. Different shape, different primitive.

What's wanted is a primitive that accepts any CSS `<length>` (`number | string`), still runs its JS math against pixels, and re-derives layout live when CSS-driven changes alter the resolved pixel value.

## Guidance

Accept `number | string`. Resolve string inputs to pixels via a hidden DOM sentinel sized to the CSS expression, observed by `ResizeObserver`, mounted inside the primitive so the cascade resolves correctly. Numeric inputs short-circuit — no sentinel, no observer, no effect.

### The resolution hook

A small shared hook returns three things: the resolved pixel value (or `null` until first measurement on the string path), the original CSS expression to embed in inline styles, and a ref the caller binds to the sentinel.

```ts
// korri/shared/primitives/lib/useResolvedCSSLength.ts
export function useResolvedCSSLength(value: number | string) {
  const ref = useRef<HTMLElement | null>(null)
  const isNumber = typeof value === "number"
  const [stringResolvedPx, setStringResolvedPx] = useState<number | null>(null)

  useEffect(() => {
    if (isNumber) return
    const element = ref.current
    if (!element) return
    const update = () =>
      setStringResolvedPx(element.getBoundingClientRect().width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
    // The observer reports CSS-driven width changes automatically, so the
    // effect does not need to re-run when the input string changes value.
  }, [isNumber])

  const resolvedPx = isNumber ? value : stringResolvedPx
  const cssValue = isNumber ? `${value}px` : value
  return { resolvedPx, cssValue, ref }
}
```

Key properties:

- **Numeric inputs are zero-cost.** No `useEffect` body executes, no DOM is mounted, no observer is attached. Existing call sites pay nothing.
- **Effect deps key only on `isNumber`.** Once the observer is attached for a string input, CSS-driven width changes are reported automatically; re-running the effect on every string-content change would needlessly disconnect and reattach.
- **`resolvedPx` is `null` until measured** for string inputs. Callers treat `null` as "not yet known" and apply a safe fallback (e.g., `columns: 1`) instead of coercing to `0`.
- **`cssValue` is the verbatim string.** Inline styles embed it directly so the visual layout tracks live CSS-driven changes the same way the rest of the consumer's themed UI does.

### The sentinel inside the primitive

The primitive renders a hidden, zero-height, absolutely-positioned, `aria-hidden` `<span>` sized to the CSS expression — but only when the input is a string.

```tsx
const SENTINEL_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  height: 0,
  visibility: "hidden",
  pointerEvents: "none",
}

return (
  <div
    ref={containerRef}
    style={{
      width: "100%",
      height: "100%",
      overflow: "auto",
      // Establishes a containing block so percent-sized sentinels resolve
      // against the primitive rather than the viewport.
      position: "relative",
    }}
  >
    {typeof cellSize === "string" && (
      <span
        ref={cellSizeMeasure.ref}
        aria-hidden="true"
        data-tilegrid-sentinel="cell-size"
        style={{ ...SENTINEL_STYLE, width: cellSizeMeasure.cssValue }}
      />
    )}
    {typeof gap === "string" && (
      <span
        ref={gapMeasure.ref}
        aria-hidden="true"
        data-tilegrid-sentinel="gap"
        style={{ ...SENTINEL_STYLE, width: gapMeasure.cssValue }}
      />
    )}
    <InnerGrid
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, ${cellSizeMeasure.cssValue})`,
        gridAutoRows: cellSizeMeasure.cssValue,
        gap: gapMeasure.cssValue,
      }}
    >
      {/* ... */}
    </InnerGrid>
  </div>
)
```

Five non-obvious choices in this layout:

- **Sentinel mounted inside the primitive** so `rem`, `em`, and `var(--…)` resolve against the primitive's cascade — including theme variables defined on intermediate ancestors. A sentinel mounted outside (or inside a portal) gets the wrong cascade.
- **Sentinel as a sibling of the inner grid**, not a child of it. The grid's `display: grid` would otherwise place the sentinel as a grid cell.
- **`position: absolute` + `top: 0, left: 0`** with the outer wrapper marked `position: relative` so percent-sized sentinels resolve against the primitive's box, not the viewport's initial containing block.
- **`height: 0, visibility: hidden, aria-hidden, pointer-events: none`.** Zero-height keeps the sentinel out of the layout flow visually; visibility hidden suppresses paint but preserves layout (so width still computes); aria-hidden keeps it off the AT tree; pointer-events none keeps it from intercepting input. `display: none` would not work — the browser doesn't compute layout for it, so width can't be measured.
- **Width carries the CSS expression** (`width: var(--cell)` / `width: 6rem`). Width is a layout-affecting property the browser will resolve to pixels, which `getBoundingClientRect().width` then reports.

### Pre-resolution fallback

The math branch must handle the `null` window cleanly:

```ts
const columns = useMemo(() => {
  if (!containerWidth || cellSizePx === null || gapPx === null) return 1
  if (cellSizePx <= 0) return 1
  return Math.max(1, Math.floor((containerWidth + gapPx) / (cellSizePx + gapPx)))
}, [containerWidth, cellSizePx, gapPx])
```

Falling back to `1` (rather than `0` or throwing) means span clamping degrades safely on the first render: a `span: 3` tile clamps to `1` for one paint, then jumps to its real size once the sentinel resolves. The user briefly sees a single-column layout, never a broken one.

### The published context contract stays unchanged

Internal consumers reading the primitive's context (e.g., a span-clamping cell renderer) still see `cellSize: number` and `gap: number` — always resolved pixels, always typed as `number`. The `number | string` widening is only at the public prop surface. This keeps every internal consumer of the context unchanged and avoids leaking the "raw vs resolved" distinction.

```ts
// In context, regardless of how the prop was authored:
readonly cellSize: number  // resolved px (0 while a string input is unmeasured)
readonly gap: number       // resolved px (0 while a string input is unmeasured)
```

## Why This Matters

**Theme tokens reach JS-bound primitives.** Without this pattern, any primitive that needs JS layout math (column count, span clamping, pagination, virtualization) is permanently incompatible with theme tokens. Designers and engineers end up either pre-resolving in the consumer (defeating the design system) or skipping the primitive (losing the layout features).

**Live correctness across runtime CSS changes.** Theme switches, accessibility zoom, root-font-size adjustments, container-query units — all reach the primitive without remount. `getComputedStyle` parsing of the prop string would only resolve once at mount and silently go stale on theme change. The sentinel observed by `ResizeObserver` updates automatically because it's the browser doing the resolution, not us.

**Existing call sites pay nothing.** Numeric inputs short-circuit the entire mechanism — no DOM, no observer, no effect work. The widening is non-breaking and zero-cost for code that doesn't need it.

**No coupled themes resolver.** The pattern doesn't know or care about the theme system. CSS already resolves `rem`, `var(--…)`, `calc(…)`, `cqi`, `vw`, `%`, container queries, etc. The sentinel just measures the result. Adding a new theme system, or moving from CSS variables to a different tokenization scheme, requires no changes to the primitive.

## When to Apply

- Any layout primitive whose props feed JS-side layout math (cell count, row count, page composition, span clamping, virtualization windowing).
- Whenever a consumer would naturally want to express size in design-system units that vary at runtime — `rem` for accessibility, `var(--token)` for theme switches, `cqi`/`cqh` for container-relative scaling, `clamp(min, fluid, max)` for responsive scales.
- When the primitive must keep working through theme switches and accessibility zoom without remounting.

Don't apply when:

- The primitive only embeds the size in CSS and runs no JS math against it. Just type the prop as `string` and pass it through; no sentinel needed.
- A pure CSS pattern (`auto-fit`, `minmax`, `grid-template-rows`) covers the use case. Prefer CSS over JS where it works. The sentinel pattern is for primitives that need a numeric pixel value the browser does not directly hand to JS in any other ergonomic way.

## Examples

### Tilegrid Roots

`TilegridScrollRoot`, `TilegridPagedRoot`, and `TilegridRailRoot` all accept `cellSize: number | string` and `gap: number | string` via this pattern. Scroll and paged Roots use the resolved pixels for column/row derivation; the rail Root uses the hook only to publish a numeric `cellSize` and `gap` in context (no math), since spans clamp to `1×1`.

```tsx
// Authoring against the design-system theme:
<TilegridScrollRoot
  items={tiles}
  cellSize="var(--cell-min)"   // resolved live; column count tracks theme
  gap="0.5rem"                 // resolved live; same path as cellSize
>
  <TilegridCells renderCell={renderTile} />
</TilegridScrollRoot>
```

### Storybook canvas as args (companion pattern)

A natural companion when shipping this pattern: replace fixed-size story decorators with `containerWidth: string` / `containerHeight: string` text controls that default to empty. Empty falls back to `100%` so Storybook's viewport / measure addons drive the canvas size, which makes live CSS-length resolution easy to validate visually.

```tsx
const meta = {
  args: {
    cellSizeCSS: "",      // optional CSS-length override for the demo
    containerWidth: "",   // empty = fill parent; type a length to pin
    containerHeight: "",
  },
  argTypes: {
    cellSizeCSS: { control: "text" },
    containerWidth: { control: "text" },
    containerHeight: { control: "text" },
  },
  decorators: [
    (Story, ctx) => {
      const { containerWidth, containerHeight } = ctx.args
      return (
        <div
          style={{
            width: containerWidth?.trim() || "100%",
            height: containerHeight?.trim() || "100%",
          }}
        >
          <Story />
        </div>
      )
    },
  ],
}
```

E2E specs that depend on a deterministic canvas geometry can pin the size via Storybook URL args (`args=containerWidth:900px;containerHeight:560px`) without affecting the default fluid behavior in the Storybook UI.

### What this replaces

```tsx
// Before — pixel-locked, defeats the design system, goes stale on theme change.
<TilegridScrollRoot items={tiles} cellSize={140} gap={8}>
  ...
</TilegridScrollRoot>

// Caller hand-rolls resolution and re-runs on theme change:
const cellSize = useThemedPixelValue("--cell-min")  // bespoke hook, brittle
<TilegridScrollRoot items={tiles} cellSize={cellSize} gap={8}>
  ...
</TilegridScrollRoot>
```

## Caveats and Open Follow-ups

- **`happy-dom` doesn't drive `ResizeObserver` or resolve `rem`.** Unit tests can assert the sentinel renders with the expected CSS expression, that numeric inputs render no sentinel, and that the pre-resolution fallback (`columns: 1`) holds — but they cannot assert resolved pixel values. End-to-end correctness lives in Storybook visual review or browser-driven Playwright specs.
- **One sentinel per resolved length.** Two strings means two sentinels. Cheap, but worth knowing if a primitive has many size-like props. A primitive with 5+ length props might want a single multi-value sentinel that exposes each via a separate computed style; not currently needed in this codebase.
- **CSS containment can affect resolution.** If an ancestor uses `contain: size`, container-relative units inside the contained subtree resolve against the contained box, not the viewport. This is correct behavior, but worth being aware of if a primitive is dropped into a `contain`ed surface.
- **First-paint single-column flash.** String inputs render at `columns: 1` for the first paint before the observer reports. For most use cases this is invisible; for high-density grids it can be a perceptible flash. If it becomes a problem, the workaround is to suspend rendering of cells until `resolvedPx !== null`, accepting one extra paint cycle of empty grid in exchange for never showing a wrong column count.

## Related

- `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md` — the broader fluid-design discipline this pattern enables in JS-bound primitives. Specifically resolves the "Tilegrid still takes a fixed pixel `cellSize`" follow-up captured there.
- `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md` — the Tilegrid mode-as-composition shape that hosts this pattern in three sibling Roots.
- `docs/solutions/best-practices/control-driven-storybook-coverage-for-combinatorial-components-2026-05-01.md` — the controlled-stories discipline the Storybook companion pattern extends.
- `korri/shared/primitives/lib/useResolvedCSSLength.ts` — canonical implementation of the hook.
- `korri/shared/primitives/lib/useContainerSize.ts` — sister hook the implementation mirrors in lifecycle shape.
- `korri/shared/primitives/components/Tilegrid/` — the three Roots that consume the hook.
- `../../../work/.archive/01KQDTYV09D7NMQE79KJGS1Q5X-feat-tilegrid-css-length-cellsize/plan.md` — the implementation plan, including unit decomposition and decisions.
- `../../../work/.archive/01KQDTYV09D7NMQE79KJGS1Q5X-feat-tilegrid-css-length-cellsize/requirements.md` — the requirements brainstorm where the design space was scoped.
