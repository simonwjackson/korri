# Research: Intrinsic / Fluid Web Design with Tailwind CSS v4

## Summary

Tailwind v4's CSS-first `@theme` block lets you define `clamp()`-based fluid tokens for type and space that scale continuously without breakpoints, then use them via named utilities everywhere. Container queries are now built-in (`@container`, `@sm:` … `@max-*`, `@min-*`), and arbitrary-value syntax handles the RAM grid pattern and `cqi`/`cqw` container-relative units. Together these cover the three pillars of intrinsic design—fluid scale, component-relative layout, and additive grids—without reaching for `md:`/`lg:` viewport variants.

---

## Findings

### 1. Tailwind v4 `@theme` is CSS-first, values are plain CSS custom properties

Every token in `@theme` becomes a CSS custom property on `:root`. That means **`clamp()` is a valid token value**—the browser evaluates it natively at render time. Tailwind does not pre-process or strip `clamp()` calls in theme values.

```css
/* styles/app.css */
@import "tailwindcss";

@theme {
  /* Fluid type scale (Utopia-style) */
  --text-sm:   clamp(0.833rem, calc(0.833rem + 0.139vw), 0.889rem);
  --text-base: clamp(1rem,     calc(1rem     + 0.222vw), 1.125rem);
  --text-lg:   clamp(1.2rem,   calc(1.2rem   + 0.389vw), 1.424rem);
  --text-xl:   clamp(1.44rem,  calc(1.44rem  + 0.611vw), 1.802rem);
  --text-2xl:  clamp(1.728rem, calc(1.728rem + 0.9vw),   2.281rem);
  --text-3xl:  clamp(2.074rem, calc(2.074rem + 1.278vw), 2.887rem);
  --text-4xl:  clamp(2.488rem, calc(2.488rem + 1.778vw), 3.653rem);

  /* Fluid space scale */
  --spacing-xs:  clamp(0.25rem,  calc(0.25rem  + 0.278vw), 0.5rem);
  --spacing-sm:  clamp(0.5rem,   calc(0.5rem   + 0.556vw), 1rem);
  --spacing-md:  clamp(1rem,     calc(1rem      + 1.111vw), 2rem);
  --spacing-lg:  clamp(2rem,     calc(2rem      + 2.222vw), 4rem);
  --spacing-xl:  clamp(4rem,     calc(4rem      + 4.444vw), 8rem);
}
```

These become `text-sm`, `text-base`, `p-sm`, `gap-lg`, etc. in utility classes.

[Source: Tailwind CSS v4.0 announcement — `@theme` + CSS variables](https://tailwindcss.com/blog/tailwindcss-v4)  
[Source: Tailwind `font-size` docs with `--text-*` custom properties](https://tailwindcss.com/docs/font-size)  
[Source: Theme variables docs](https://tailwindcss.com/docs/theme)

---

### 2. The Utopia approach: generate the clamp() math, paste into `@theme`

Utopia.fyi calculates the exact slope formula (`clamp(min, calc(base + slope * vw), max)`) for modular type and space scales. The recommended workflow for Tailwind v4:

1. Go to [utopia.fyi/type/calculator](https://utopia.fyi/type/calculator) or [utopia.fyi/space/calculator](https://utopia.fyi/space/calculator).
2. Configure min/max viewport and base font size, choose a modular scale.
3. Export as **CSS custom properties** (the calculator outputs them as `--step-0`, `--step-1` etc.).
4. Paste directly into your `@theme` block, renaming to match Tailwind's `--text-*` / `--spacing-*` namespace.

There is no need for a plugin when working with v4 — the CSS output from Utopia is valid directly.

**Gotcha:** Tailwind v3 plugins like `cwsdigital/tailwind-utopia` rely on `tailwind.config.js` theme extension and do **not** work with v4's CSS-first setup. Use the raw Utopia CSS output instead.

[Source: Utopia.fyi](https://utopia.fyi)  
[Source: Reddit thread — fluid typography in Tailwind v4](https://www.reddit.com/r/tailwindcss/comments/1j7i5pz/)

---

### 3. Arbitrary `clamp()` values inline — the escape hatch

For one-off values where you don't want a named token, Tailwind v4 accepts `clamp()` directly in square-bracket arbitrary syntax:

```html
<!-- Font scales with viewport, no named token needed -->
<h1 class="text-[clamp(1.5rem,4vw,3rem)]">Hero Title</h1>

<!-- Padding breathes with viewport -->
<section class="p-[clamp(1rem,5vw,4rem)]">...</section>

<!-- Gap that scales -->
<div class="grid gap-[clamp(0.5rem,2vw,2rem)]">...</div>
```

**Gotcha:** Spaces in `clamp()` inside class names break Tailwind's parser; use underscores or a CSS variable instead:

```html
<!-- Use underscores for spaces in arbitrary values -->
<h1 class="text-[clamp(1.5rem,_4vw,_3rem)]">...</h1>
```

[Source: DEV Community — fluid layouts without media queries](https://dev.to/hexshift/how-to-create-adaptive-fluid-layouts-in-tailwind-css-without-media-queries-1o78)

---

### 4. Container Queries — built-in in Tailwind v4 (no plugin needed)

Tailwind v4 ships container queries in core. The `@tailwindcss/container-queries` plugin from v3 is no longer required.

**Declare a container:**
```html
<div class="@container">
  <!-- children can query this container's width -->
</div>
```

**Named containers** (for nested `@container` specificity):
```html
<div class="@container/card">
  <p class="@sm/card:text-lg">...</p>
</div>
```

**Available container variants (min-width by default):**
```html
<div class="@container">
  <div class="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 @xl:grid-cols-4">
    ...
  </div>
</div>
```

**Max-width container queries (`@max-*`):**
```html
<div class="@container">
  <!-- Single column when container is narrower than md -->
  <div class="grid grid-cols-3 @max-md:grid-cols-1">...</div>
</div>
```

**Range queries (stack `@min-*` + `@max-*`):**
```html
<div class="@container">
  <div class="@min-sm:@max-lg:text-lg">...</div>
</div>
```

**One-off arbitrary container breakpoints:**
```html
<div class="@container">
  <div class="@[500px]:flex-row">...</div>
</div>
```

Default container size scale: `@3xs` (16rem) … `@7xl` (80rem).  
Customize via `--container-*` theme variables in `@theme`.

[Source: Tailwind CSS v4.0 blog — container queries in core](https://tailwindcss.com/blog/tailwindcss-v4)  
[Source: Responsive Design docs — container query variants](https://tailwindcss.com/docs/responsive-design)

---

### 5. Container Query Length Units (`cqi`, `cqw`, `cqb`, `cqh`)

These units are relative to the nearest `@container` ancestor, not the viewport. Use them in arbitrary values for **continuously fluid sizing relative to the container** (not just at stepped breakpoints):

```html
<!-- Font size that's always 5% of container inline width -->
<div class="@container">
  <h2 class="text-[5cqi]">Fluid to container</h2>
  <p class="text-[3cqw]">Also fluid</p>
</div>
```

Combine with `clamp()` for bounded fluid sizing:
```html
<div class="@container">
  <h2 class="text-[clamp(1rem,_5cqi,_3rem)]">Bounded fluid</h2>
</div>
```

**`@container-size` utility (added v4.3.0):** By default, `@container` only tracks the inline size (width). For `cqb` and `cqh` (block-axis) units, you need the container to also track its block size — use the new `@container-size` utility:

```html
<div class="@container-size">
  <!-- cqb / cqh now work inside here -->
  <div class="h-[10cqb]">...</div>
</div>
```

[Source: Responsive Design docs — container query length units](https://tailwindcss.com/docs/responsive-design)  
[Source: Tailwind v4.3.0 release — @container-size](https://laravel-news.com/scrollbar-styling-and-container-size-utilities-in-tailwind-css-v430)

---

### 6. Intrinsic Grid — RAM Pattern via Arbitrary Values

The **Repeat-Auto-Minmax (RAM) pattern** creates grids that add/remove columns based on available space — zero breakpoints needed:

```html
<!-- Auto-fit: columns collapse/expand as space allows, cells stretch to fill -->
<div class="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-md">
  ...
</div>

<!-- Auto-fill: keeps empty ghost columns (useful for alignment) -->
<div class="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
  ...
</div>
```

Combine with CSS custom properties from `@theme`:
```html
<!-- Reference a theme variable inside the arbitrary value -->
<div class="grid grid-cols-[repeat(auto-fit,minmax(var(--spacing-xl),1fr))]">
```

**Gotcha:** Underscores are required instead of spaces inside arbitrary bracket values in class attributes, **except** inside `calc()` expressions where Tailwind handles them differently. Test with your v4 build.

[Source: Steve Kinney — Grid auto-fit/auto-fill patterns in Tailwind](https://stevekinney.com/courses/tailwind/grid-auto-fit-and-auto-fill-patterns)  
[Source: uibun.dev — responsive Tailwind grid with auto-fit](https://www.uibun.dev/blog/tailwindcss-responsive-grid)

---

### 7. Other Intrinsic CSS Utilities in Arbitrary Values

**`aspect-ratio`** — maintains proportional size across containers:
```html
<div class="aspect-video">...</div>
<div class="aspect-[4/3]">...</div>
```

**`min-width` / `max-width` with intrinsic sizing keywords:**
```html
<div class="min-w-0 max-w-[min(100%,60ch)]">...</div>
```

**`w-fit`, `w-max`, `w-min`** — intrinsic widths:
```html
<button class="w-fit px-md">Self-sizing button</button>
```

**Logical properties** (inline/block axis, direction-agnostic):
```html
<div class="ms-auto me-4 ps-sm">...</div>
```

---

### 8. Plugin Landscape for Fluid Scales in Tailwind v4

| Plugin | v4 Support | Approach |
|---|---|---|
| **fluid-tailwind** (`barvian/fluid-tailwind`) | ⚠️ Incomplete — v4 compat is an open issue (#66, Dec 2024) | Uses `~` modifier syntax: `~text-sm ~text-xl` |
| **clampwind** (`danieledep/clampwind`) | ✅ Made for v4 | PostCSS plugin; transforms `clamp(min, max)` shorthand in utilities |
| **fluid-tailwindcss** (`fluid-tailwindcss.vercel.app`) | ✅ v4-native | `fl-p-4/8` syntax, generates clamp values, includes tailwind-merge support |
| **tailwind-utopia** (cwsdigital) | ❌ v3 only | Requires `tailwind.config.js` JS theme extension |

**Recommendation for v4:** For a pure CSS-first approach, skip plugins. Generate clamp values from [utopia.fyi](https://utopia.fyi) and paste into `@theme`. For per-utility fluid shortcuts in JSX, `clampwind` or `fluid-tailwindcss` are the current v4-native options.

[Source: clampwind GitHub](https://github.com/danieledep/clampwind)  
[Source: fluid-tailwind v4 compat issue](https://github.com/barvian/fluid-tailwind/issues/66)  
[Source: fluid-tailwindcss Medium article](https://medium.com/@nguyenviet02.dev/building-fluid-responsive-designs-in-tailwindcss-v4-how-i-created-fluid-tailwindcss-cbd5f833a953)

---

### 9. Avoiding `md:`/`lg:` Viewport Variants — What to Use Instead

| Goal | Media-query approach (avoid) | Intrinsic replacement |
|---|---|---|
| Type scale | `text-sm md:text-lg lg:text-2xl` | `--text-lg: clamp(...)` in `@theme` |
| Padding/gap | `p-4 md:p-8 lg:p-12` | `p-[clamp(1rem,5vw,3rem)]` or fluid token |
| Column layout | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` | `grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]` |
| Component reflow | `flex-col md:flex-row` | `@container` → `@md:flex-row` |
| Font size per component context | `lg:text-xl` | `@lg:text-xl` with `@container` parent |
| Sidebar-aware card | `md:p-6` (viewport-based guess) | `@md:p-6` (responds to actual container width) |

The philosophy: **viewport variants are for page-frame layout** (global shell, full-page rearrangement). **Container variants and fluid clamp values handle everything inside components.**

---

## Recommendation: Single Self-Adaptive Theme in Tailwind v4

```css
/* styles/app.css */
@import "tailwindcss";

@theme {
  /* ── Fluid type (Utopia modular scale, 320px → 1280px) ── */
  --text-xs:   clamp(0.694rem, calc(0.694rem + 0.083vw), 0.75rem);
  --text-sm:   clamp(0.833rem, calc(0.833rem + 0.139vw), 0.889rem);
  --text-base: clamp(1rem,     calc(1rem     + 0.222vw), 1.125rem);
  --text-lg:   clamp(1.2rem,   calc(1.2rem   + 0.389vw), 1.424rem);
  --text-xl:   clamp(1.44rem,  calc(1.44rem  + 0.611vw), 1.802rem);
  --text-2xl:  clamp(1.728rem, calc(1.728rem + 0.9vw),   2.281rem);
  --text-3xl:  clamp(2.074rem, calc(2.074rem + 1.278vw), 2.887rem);
  --text-4xl:  clamp(2.488rem, calc(2.488rem + 1.778vw), 3.653rem);

  /* ── Fluid space (T-shirt scale) ── */
  --spacing-3xs: clamp(0.25rem,  calc(0.25rem  + 0.139vw), 0.313rem);
  --spacing-2xs: clamp(0.5rem,   calc(0.5rem   + 0.278vw), 0.625rem);
  --spacing-xs:  clamp(0.75rem,  calc(0.75rem  + 0.417vw), 0.938rem);
  --spacing-sm:  clamp(1rem,     calc(1rem     + 0.556vw), 1.25rem);
  --spacing-md:  clamp(1.5rem,   calc(1.5rem   + 0.833vw), 1.875rem);
  --spacing-lg:  clamp(2rem,     calc(2rem     + 1.111vw), 2.5rem);
  --spacing-xl:  clamp(3rem,     calc(3rem     + 1.667vw), 3.75rem);
  --spacing-2xl: clamp(4rem,     calc(4rem     + 2.222vw), 5rem);
  --spacing-3xl: clamp(6rem,     calc(6rem     + 3.333vw), 7.5rem);

  /* ── Container breakpoints (if needed for @container variants) ── */
  --container-xs:  20rem;
  --container-sm:  24rem;
  --container-md:  28rem;
  --container-lg:  32rem;
  --container-xl:  36rem;
}
```

**Usage pattern for a self-adaptive card component (no `md:`, no `lg:`):**

```tsx
// Card.tsx
<div className="@container rounded-lg bg-surface p-[clamp(1rem,5cqi,2rem)]">
  <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-sm">
    <img className="aspect-video w-full rounded object-cover" ... />
    <div className="flex flex-col gap-xs">
      <h2 className="text-xl font-semibold">Title</h2>
      <p className="text-base text-muted">Description text.</p>
    </div>
  </div>
</div>
```

The card:
- Padding scales fluidly with the container's inline size (`5cqi`)
- Columns add/remove as space allows (RAM grid)
- Type is always the right size due to fluid `--text-*` tokens
- Zero viewport breakpoints

---

## Sources

**Kept:**
- [Tailwind CSS v4.0 Blog](https://tailwindcss.com/blog/tailwindcss-v4) — primary source for `@theme`, container queries in core, `@max-*`/`@min-*` variants
- [Tailwind Responsive Design Docs](https://tailwindcss.com/docs/responsive-design) — official docs for `cqi`/`cqw` in arbitrary values, `@container-size`, container size defaults
- [Tailwind Theme Variables Docs](https://tailwindcss.com/docs/theme) — `@theme` override syntax
- [Tailwind Font-Size Docs](https://tailwindcss.com/docs/font-size) — `--text-*` with `--text-*--line-height` subproperties
- [Utopia.fyi](https://utopia.fyi) — canonical fluid type/space scale generator
- [DEV: Adaptive fluid layouts without media queries](https://dev.to/hexshift/how-to-create-adaptive-fluid-layouts-in-tailwind-css-without-media-queries-1o78) — inline `clamp()` arbitrary value patterns
- [Steve Kinney — grid auto-fit patterns](https://stevekinney.com/courses/tailwind/grid-auto-fit-and-auto-fill-patterns) — RAM pattern with v4 arbitrary values
- [clampwind GitHub](https://github.com/danieledep/clampwind) — v4-native fluid PostCSS plugin
- [fluid-tailwindcss Medium](https://medium.com/@nguyenviet02.dev/building-fluid-responsive-designs-in-tailwindcss-v4-how-i-created-fluid-tailwindcss-cbd5f833a953) — another v4-native fluid plugin
- [Reddit — fluid typography in Tailwind v4](https://www.reddit.com/r/tailwindcss/comments/1j7i5pz/) — community patterns for CSS-first config
- [Reddit — clampwind announcement](https://www.reddit.com/r/tailwindcss/comments/1llqvjd/) — shows generated clamp output format
- [Kickstage — component-first responsive design](https://kickstage.com/blog/component-first-responsive-design-container-queries-tailwind-v4) — container query practical guide
- [Laravel News — v4.3.0 `@container-size`](https://laravel-news.com/scrollbar-styling-and-container-size-utilities-in-tailwind-css-v430) — documents new utility

**Dropped:**
- v3 migration guides — stale; `tailwind.config.js`-based patterns don't apply
- `cwsdigital/tailwind-utopia` — v3 plugin only
- `barvian/fluid-tailwind` — v4 compat unresolved as of early 2025
- Generic CSS tutorials without v4-specific content

---

## Gaps

1. **`--text-*--line-height` and `--text-*--letter-spacing` subproperties with `clamp()`** — not confirmed whether these subproperty slots (used in v4 for bundled line-height/letter-spacing) also accept `clamp()`. Likely yes (they're just custom properties), but needs verification.

2. **`clampwind` / `fluid-tailwindcss` production maturity** — both are new (2024–2025) community plugins. No benchmark data on performance, edge cases, or long-term maintenance.

3. **TV/handheld extremes** — the Utopia calculator is calibrated for desktop viewports (320px–1280px typical). For a stack that targets tiny handheld screens and TVs simultaneously, the min/max viewport parameters and scale ratio need explicit calibration. Suggest using Utopia's API with custom `minWidth`/`maxWidth` to cover e.g. 320px–1920px.

4. **`@container` and SSR** — no issues found, but `container-type: inline-size` must be explicitly set on the element (Tailwind's `@container` utility adds it). Verify rendering output for SSR frameworks.

5. **`fluid-tailwind` (barvian) v4 timeline** — given the active issue and community interest, this may ship. Check [github.com/barvian/fluid-tailwind/issues/66](https://github.com/barvian/fluid-tailwind/issues/66) before choosing a plugin.
