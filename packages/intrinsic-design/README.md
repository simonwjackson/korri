# @korri/intrinsic-design

The **intrinsic design core** — one container-adaptive token scale, derived from
a handful of knobs. The goal: every design adapts naturally to *any* surface or
container — any size, any aspect ratio — with no breakpoints and no per-surface
special-casing, and **nothing re-implements the math**. Set the inputs once; the
whole scale derives.

This is the recipe documented in
`tools/theme-workshop/device-lab/AGENTS.md` ("the default for every Korri
theme"), promoted from prose into shared, importable code.

## Use it

```css
@import "tailwindcss";
@import "@korri/intrinsic-design";
```

Tokens only, **without Tailwind** (e.g. the theme-workshop chrome — the reference
implementation built on this core):

```css
@import "@korri/intrinsic-design/recipe.css";
```

Either way, a theme/app overrides the inputs on `:root` (or on any per-surface
container) and consumes the scale.

## The contract

**Inputs you set** (defaults are neutral):

| Knob | Default | Meaning |
|---|---|---|
| `--intrinsic-base-min` | `12px` | clamp floor — base never smaller |
| `--intrinsic-base-cqi` | `2.6` | fluid anchor — `× 1cqi` of the container |
| `--intrinsic-base-max` | `26px` | clamp ceiling — base never larger |
| `--intrinsic-ratio` | `1.25` | type scale ratio (`step = base · ratioⁿ`) |
| `--intrinsic-space-unit` | `0.5em` | space step unit (em → tracks text) |
| `--intrinsic-snap` | `0.02px` | size quantum — **pixel themes set `1px`** |

**Scale you get** (live, container-adaptive):

- `--intrinsic-base` — the one fluid, clamped anchor everything derives from.
- `--intrinsic-text-dn3 … -0 … -up3` — the type scale (`text-dn3` … `text-0` …
  `text-up3` utilities).
- `--intrinsic-space-1 … -6` — the space scale (`p-i1`, `m-i2`, `gap-i3`,
  `size-i4`, … utilities).

## Why it adapts without edge cases

- **`cqi` not viewport units** → the scale tracks the *container*, so the same
  component works in a tile, a panel, or full-bleed, at any aspect ratio, with
  no media queries.
- **`clamp()` on the base** → legible floor, sane ceiling; it never collapses or
  runs away.
- **One base** → type and space both derive from it, so they stay in proportion
  at every size.
- **The bounded-media rule** → cap big art against the base so media and text
  share one ceiling and never drift:
  ```css
  height: min(<fluid cqh/cqw>, calc(var(--intrinsic-base) * N));
  ```
  This is the single most common intrinsic edge case; deriving the cap from
  `--intrinsic-base` is what solves it once.

## Pixel vs smooth

The default is smooth (`--intrinsic-snap: 0.02px`). A pixel-art theme that needs
crisp, whole-pixel type sets `--intrinsic-snap: 1px` — the same `round(…, snap)`
formula then snaps the base and type scale to whole pixels (pico does this).

## Verify

```sh
node build-check.mjs   # compiles through Tailwind v4, asserts the live scale emits
```

## Status / next

Extracted as the shared core. Not yet wired into consumers — the pico prototype
still defines its own `--pico-*` generators inline. Migration path: a theme sets
the `--intrinsic-*` knobs + maps its `--pico-*` (or own) tokens onto
`--intrinsic-*`, then deletes its hand-rolled generator block. The workshop's
own neutral chrome is the intended first real consumer (reference
implementation).
