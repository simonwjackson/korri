---
title: Fluid theme tokens and container queries for handheld-to-TV scaling
date: 2026-05-01
last_updated: 2026-05-01
# Refreshed 2026-05-01: Tilegrid `cellSize` is no longer pixel-locked; the
# follow-up in Caveats has been updated and now links to the sentinel-
# resolution learning that resolves it.
category: best-practices
module: korri/shared/design-system/theme + AGENTS.md
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Building UI that runs across handheld, desktop, and TV with the same components
  - Tempted to write `font-size: 14px` or `padding: 24px` directly in JSX or a `<style>` block
  - Designing a grid that should hold more items on a larger surface, not bigger items
  - Adding new theme tokens to `korri/shared/design-system/theme/`
  - Reviewing a refactor that introduces device-specific layouts or per-breakpoint screens
related_components:
  - frontend_stimulus
  - documentation
tags:
  - tailwind-v4
  - container-queries
  - fluid-typography
  - clamp
  - design-tokens
  - responsive-design
  - tv-ui
  - density-over-zoom
---

# Fluid theme tokens and container queries for handheld-to-TV scaling

## Context

Korri runs across handheld, desktop, and TV (10ft viewing) from one codebase. Pixel-locked sizes encode one viewing context as canonical and force every other context to look like a zoom of it. The failure mode shows up two ways:

1. **Type drifts micro for TV.** When agents (human or AI) reach for "tasteful" type sizes from the desktop design tradition (Stripe, Linear, fashion-editorial), labels land at 10–12px. Those are unreadable from a couch even though the brief explicitly said "1080p, viewed from ~10 feet."

2. **Layouts feel zoomed instead of denser.** A TV with 4× the area of a handheld should hold ~4× more tiles, not show the same handful of tiles 4× bigger. Pixel-locked grid cells (`cellSize: 180`) freeze the cell count and force the eye to read everything as a scaled-up phone screen.

Both fail the same way: a single context (usually desktop) is encoded as "the truth" and other contexts get treated as bigger or smaller copies of it.

A separate but adjacent failure: **inline styles and raw CSS in `<style>` blocks bypass the theme entirely.** Even with a Tailwind theme floor for type, `style={{ fontSize: 11 }}` and `font-size: 11px` in scoped CSS will shoot through it. The most disciplined theme cannot enforce itself if the codebase routinely escapes it.

## Guidance

Three layered moves, with project-instruction rules behind them so the discipline survives review pressure.

### 1. Make Tailwind's standard tokens fluid in `@theme`

Redefine Tailwind v4's default type and spacing tokens in `korri/shared/design-system/theme/styles.css` so a single utility name (`text-base`, `p-4`) is sensible across handheld → desktop → TV. Standard Tailwind vocabulary; only the values are project-specific.

```css
@theme {
  --font-sans: "Geist Variable", ui-sans-serif, system-ui, sans-serif;

  /* Fluid spacing base. Every p-*, m-*, gap-* utility scales from this. */
  --spacing: clamp(1.5px, calc(1px + 0.156cqi), 5px);

  /* Fluid type scale. Standard Tailwind utility names. text-xs is removed
     because it is below the legibility floor for TV viewing. */
  --text-xs: initial;
  --text-sm:   clamp(13px, calc(12px + 0.25cqi),  17px);
  --text-base: clamp(15px, calc(14px + 0.4cqi),   22px);
  --text-lg:   clamp(17px, calc(15px + 0.55cqi),  28px);
  --text-xl:   clamp(19px, calc(16px + 0.75cqi),  34px);
  --text-2xl:  clamp(22px, calc(17px + 1.1cqi),   44px);
  --text-3xl:  clamp(26px, calc(18px + 1.5cqi),   56px);
  --text-4xl:  clamp(32px, calc(20px + 2cqi),     72px);
  --text-5xl:  clamp(40px, calc(24px + 2.6cqi),   92px);
  --text-6xl:  clamp(48px, calc(28px + 3.4cqi),  120px);
}
```

Two design choices in this scale:

- **MIN bottoms out at the smallest legible size** for the smallest realistic context (~320px container, handheld).
- **MAX caps before billboard sizes** so a 4K TV doesn't get heading-as-billboard.
- **The `cqi` interpolation** scales with the *container's* inline size, not the viewport. When no container query container is in scope, `cqi` falls back to viewport units per the CSS Containment spec, so this works inside or outside `@container`.

Calibration target — `text-6xl` at common contexts:

| Container width | Computed size |
|---|---|
| 320px (handheld) | 48px (clamps to MIN) |
| 1280px (desktop) | ~71px |
| 1920px (TV/1080p) | ~93px |
| 2700px+ (4K) | 120px (clamps to MAX) |

### 2. Declare `container-type: inline-size` on top-level surfaces

For the fluid tokens to respond to *the surface they live in* (rather than the viewport), each top-level UI surface declares itself as a container query container:

```css
[data-exploration="hero"].hero-root {
  container-type: inline-size;
  background-color: var(--surface);
}
```

Now every `text-*`, `p-*`, `gap-*` utility inside that surface scales with the surface's inline size. The same composition embedded in a 420px sidebar and a 1920px TV both look right — not because there are two layouts, but because the type and spacing breathe with the container.

Use container query units (`cqi`, `cqh`, `cqw`) in tokens and arbitrary values; reserve `vh`/`vw` for true page-frame measurements. Example: `top-[12cqh]` positions the hero overlay at 12% of the *hero region*, not the viewport.

### 3. Grids: density over zoom

A TV should hold more items, not bigger items. The right primitive shape is `auto-fit` with a minimum cell size:

```css
grid-template-columns: repeat(auto-fit, minmax(var(--cell-min), 1fr));
```

The number of visible cells is a *side effect* of `container-width / cell-min`. A handheld might fit 3 tiles, a TV fits 12, with no JavaScript and no per-device layout.

### 4. Project rules so the discipline survives

Add these to `AGENTS.md` so the rules are part of the working agreement, not just a one-time refactor:

- Use design tokens for type, spacing, color, and radius. Hardcoded values are a last resort and require an inline comment justifying why no token fits.
- **Theme tokens for size and spacing must be fluid by default** (`clamp(min, fluid, max)`). Static pixel values are reserved for things that genuinely should not scale (e.g., a 1px hairline border).
- **Components respond to their container, not the viewport.** Use container query units and `@container`. Reserve `@media` for page-frame restructuring.
- **Grids add cells when space allows**, not scale fixed cells up. Density over zoom.
- Inline `style={{ … }}` and raw CSS values inside scoped `<style>` blocks bypass the theme. Prefer Tailwind utilities or theme-variable references.

## Why This Matters

**Same composition, every context.** A "Hero" home screen designed once works on a phone, a desktop, a 65" TV — without per-device layouts or hand-built scaling. The visual language is one curve, not three encoded breakpoints.

**Catches drift to micro-text as a build-time miss.** With `--text-xs: initial`, writing `text-xs` simply doesn't compile a font-size — it's a missing utility. The smallest legitimate size is `text-sm`, calibrated to the floor. If an agent reaches for inline `fontSize: 11`, the AGENTS rule + a future lint can catch it. The theme cannot enforce itself if the codebase escapes it routinely; the rules close that gap.

**Container queries beat viewport queries for components.** A library tile rail in a 420px sidebar on a 1920px screen should look right *as a 420px component*, not as a 1920px component crammed into 420px. `cqi` makes that automatic.

**Density-over-zoom matches how humans actually use larger screens.** A bigger surface is for *seeing more*, not for seeing the same things bigger. Auto-fit grids honor that intent; fixed-column grids fight it.

## When to Apply

- Any new UI surface in `korri/products/**` or `korri/shared/design-system/**`.
- Whenever adding a token to the design-system theme.
- Whenever tempted to write `font-size: 14px`, `padding: 24px`, or any pixel-locked size.
- Designing tile/card/list grids of repeating items.
- Reviewing a PR that introduces breakpoint-specific layouts (`md:`, `lg:`) for things that could be fluid.

## Examples

### Before — pixel-locked, bypasses the theme

```tsx
function HeroOverlay({ game }) {
  return (
    <div style={{
      position: "absolute",
      left: 64,
      right: 64,
      top: "12vh",
      gap: 18,
    }}>
      <div style={{ fontSize: 11, letterSpacing: "0.32em" }}>
        Continue playing
      </div>
      <h1 style={{ fontSize: 84, fontWeight: 600 }}>{game.name}</h1>
      <div style={{ fontSize: 12 }}>Last played 12 minutes ago</div>
    </div>
  )
}
```

Problems: viewport-locked (`12vh`); pixel-locked sizes that look sane at 1920px and broken everywhere else; bypasses every theme floor; 11px and 12px are below the TV-legibility floor.

### After — fluid, container-aware, theme-anchored

```tsx
function HeroOverlay({ game }) {
  return (
    <div className="absolute left-16 right-16 top-[12cqh] flex max-w-[760px] flex-col gap-6">
      <div className="text-sm font-medium uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
        Continue playing
      </div>
      <h1 className="text-6xl font-semibold leading-[0.96] tracking-[-0.025em] text-[color:var(--ink)]">
        {game.name}
      </h1>
      <div className="text-sm uppercase tracking-[0.12em] text-[color:var(--ink-dim)]">
        Last played 12 minutes ago
      </div>
    </div>
  )
}
```

Type and spacing now scale fluidly with the hero surface's inline size:

| Surface width | `text-sm` | `text-6xl` | `gap-6` |
|---|---|---|---|
| 420px (handheld) | 13px | 48px | 9px |
| 1280px | 15px | 71px | 19px |
| 1920px (TV) | 17px | 93px | 24px |

Same JSX, no breakpoints, no per-device variant.

### Container declaration that makes it work

```css
[data-exploration="hero"].hero-root {
  container-type: inline-size;
  /* Now child cqi/cqh resolve against this surface, not the viewport. */
}
```

### Grid: density over zoom (target shape)

```css
.tilegrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(var(--cell-min, 140px), 1fr));
  gap: var(--spacing);
}
```

Result: a 420px container shows ~3 tiles; a 1920px container shows ~13. The cells stay roughly the same size; the *count* changes.

## Caveats and Open Follow-ups

- **Tilegrid now accepts CSS-length `cellSize` and `gap`.** As of 2026-04-30, all three Tilegrid Roots accept `number | string` for `cellSize` and `gap` (`"6rem"`, `"var(--cell-min)"`, `"clamp(...)"`, etc.) and resolve string inputs to live pixel values via a hidden DOM sentinel observed by `ResizeObserver`. Column count, row count, span clamping, and pagination all track CSS-driven changes (theme switch, root font-size, container-query units) at runtime. The original "evolve Tilegrid to support `minCellSize` + auto-fit in CSS" follow-up is no longer the only path to fluid Tilegrid sizing — the sentinel-resolution path keeps uniform cells and span clamping intact, which the auto-fit path would have lost. See `docs/solutions/best-practices/css-length-props-with-sentinel-resolution-2026-05-01.md` for the pattern. An auto-fit variant remains an open option if a future use case wants density-over-zoom *without* uniform cells.
- **Default line-heights inherit.** The fluid `--text-*` tokens don't currently set per-token line-heights via `--text-*--line-height`. For most utility-driven text, inherited or `normal` line-heights are fine; for display-scale headings, set `leading-*` explicitly. If we find we keep reaching for the same `leading-*` per type size, formalize them in the theme.
- **Geometric clamp curves are calibrated, not optimized.** The MIN/MAX/slope values in the type scale were chosen for a reasonable handheld → TV interpolation; they have not been tested against a wide library of art-direction scenarios. Treat them as a starting point worth refining when real designs break the floor or ceiling.
- **Container query unit fallback.** When no container query container is declared in an ancestor chain, `cqi` falls back to `vi` (viewport inline) per spec. This is forgiving — components work even outside a declared container — but it means `container-type: inline-size` on the surface root is a real requirement for the container-relative behavior. Don't forget it.

## Related

- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — same project, same surfaces; spatial navigation is the input model these visuals are designed for.
- `docs/solutions/best-practices/css-length-props-with-sentinel-resolution-2026-05-01.md` — the implementation pattern that lets Tilegrid (and other JS-bound primitives) consume the fluid tokens defined here.
- `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md` — the Tilegrid primitive that consumes these tokens.
- `korri/shared/design-system/theme/styles.css` — canonical implementation of the fluid token scale.
- `korri/shared/design-system/explorations/home-screens/HomeHero.stories.tsx` and `HomeMosaic.stories.tsx` — the two reference compositions that exercise the scale; useful as worked examples.
- `docs/brainstorms/2026-04-30-shift-home-screen-visual-language-requirements.md` — the visual-language exploration that surfaced this practice.
- `AGENTS.md` — Rules of Engagement section carries the project rules that protect this approach from regression.
