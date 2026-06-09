# device-lab

A reusable, template-agnostic **physical-calibration harness** for designing UI
at true device size. It is desk chrome, not part of any shipped theme: it sizes
each screen to real millimetres (via a once-per-monitor credit-card calibration)
and exposes per-device knobs, so you can evaluate one design across many devices
without per-device code.

This file is the design philosophy the kit exists to serve. Read it before
changing the kit or authoring a design against it.

## The goal: one self-adaptive source of truth, no media queries

We want to ship a **single theme** that adapts to any device, ideally without
enumerating device properties. The reframe that makes this possible:

> **Don't adapt to the device. Adapt to the space and the content.**

Media queries enumerate *cases* ("if phone… if TV…") — a combinatorial list that
grows forever and scatters layout decisions everywhere. Intrinsic design inverts
it: declare *relationships* ("this item is at least 12em and wants to fill the
row") and let the browser solve the layout for whatever space it is handed.
Devices are infinite and unknowable; available space and content min-sizes are
local and knowable. Never ask "is this a TV?" — ask "how much room do I have, and
how small can this get before it breaks?"

The source of truth becomes the design expressed as intrinsic rules + fluid
tokens. Adaptation is then an *emergent property* of those rules meeting a
container — not a pile of per-device overrides.

## Three tiers of adaptation

Separate what "adapt" means, because the tiers have very different costs.

1. **Scale — continuous, zero queries, zero properties.**
   Sizes change smoothly with available space. `clamp(min, <cqi/vw>, max)` for
   type; `em` / `cqi` for spacing. Covers most typography and rhythm and needs
   nothing explicit. (The pico prototype uses `cqw` + `em` for this.)

2. **Reflow — emergent, zero breakpoints.**
   The *arrangement* changes as a consequence of space + content, decided by the
   browser:
   - `grid-template-columns: repeat(auto-fit, minmax(<min>, 1fr))` — the "RAM"
     pattern. Column count adapts continuously to width; one line, no thresholds.
     The most powerful no-media-query tool.
   - `flex-wrap` with a sensible `flex-basis` / `min-width`.
   - Intrinsic sizing: `min-content` / `fit-content` / `min()` / `aspect-ratio`
     so things shrink-to-fit.
   Lean on this tier hard. Much of "responsive" is just reflow you get for free.

3. **Re-compose / art-direct — a genuine decision.**
   A handheld single-column carousel vs a 10-foot lean-back grid with a sidebar
   and larger focus targets is a *different idea*, not a continuous function of
   width. This is the one place a branch is unavoidable. The only questions are
   *where* it lives and *how few* there are.

## The honest constraint

Tiers 1–2 need **no explicit device properties at all**. Tier 3 needs a
decision, and a decision is a threshold. You cannot fully escape it — only make
it **local, singular, and semantic** instead of global and scattered. Preferred,
best to worst for a single-theme goal:

- **Container queries, not media queries.** Same mechanism, but a component
  reacts to *its own* container's size, not the global viewport. The same
  component "just works" in a 71 mm handheld screen or a 120 mm panel because it
  responds to its box, not to a device. This is the natural fit for the lab — the
  screen (`.lab-screen`) is already a `container-type: size` query container.
- **Container *style* queries on one semantic token.** Instead of branching on
  `min-width: 600px`, a surface sets a single custom property (e.g.
  `--surface: tv`) and components do `@container style(--surface: tv)`. The one
  unavoidable decision lives in one place; every component reads the same source
  of truth. (Caveat: style-query support is newer than size queries.)
- **No-query calc hacks** (e.g. the Flexbox Albatross,
  `flex-basis: calc((40em - 100%) * 999)`) can flip row↔column with zero
  queries, but are fragile and unreadable. Avoid as a foundation.

So the target is not "no decision" — it is **one decision, named once, read
everywhere.** That is still a single source of truth.

## Recommended shape for a shippable theme

1. **Author one composition in tiers 1–2 only** — fluid `clamp` tokens, auto-fit
   grid, `flex-wrap`, intrinsic sizing, `aspect-ratio`. No queries. This single
   source handles most size/aspect variation continuously.
2. **Keep device *facts* at the boundary.** The lab is the pattern: physical
   size / dpi enter at the edge (mm → px/mm); components never see device
   identity, only their container. That boundary is the firewall that stops
   device-specific code leaking inward.
3. **Allow exactly one art-direction seam** for the genuine 10-foot case,
   expressed as a single container (style) query driven by one token — not a
   spray of media queries. Treat it like a feature gate: temporary, centralized,
   removable.

## Tokens: few generators, many derived outputs

A self-adaptive theme is undermined just as badly by **granular tokens** as by
media queries. A slider (or hand-set literal) per token re-creates the
"enumerate every case" problem one level down. The point of a generative system
is *compression*: few inputs, many outputs, relationships preserved. Per-token
control is *decompression* — you end up hand-maintaining the thing the system
was supposed to compute.

**Separate two sets that are not the same:**

- **Knobs** — the independent decisions you tune. Keep these to a small handful.
- **Tokens** — the values the CSS reads. There can be many; most are *outputs of
  a function*, not independent inputs. You do not slide them; they fall out.

> Tokens encode **relationships you want to keep true**, not values you want to
> set. If changing token A always means you'd also change token B, they are one
> knob and one derivation — not two tokens.

**Tiered tokens (industry standard: Material 3, Spectrum, Salesforce, W3C DTCG):**

1. **Primitive / option** — raw ramps *generated from a seed*, not enumerated:
   - type scale = `base × ratio^n`
   - space scale = `base-unit × step-series`
   - fluid scale = `clamp()` parameterized by min/max size + min/max container
   - palette = seed colour + contrast targets → full ramp (or, as in pico, a
     fixed brand palette used as immutable primitives)
2. **Semantic / alias** — intent: `--surface`, `--text-body`, `--space-inline`.
   Granularity here is fine; it is clarity, not control.
3. **Component** (optional) — scoped, also derived: `--cart-min-inline`.

**The balance heuristic.** Expose a knob only when the decision is (a) genuinely
independent — cannot be derived from another knob — and (b) something a person
will actually want to vary. Everything correlated collapses into the generator
it correlates with. A surface usually needs ~5–7 knobs: a base size, a type
ratio, a space base / density, maybe a focus-target floor, a palette seed.
Every font-size, gap, padding, and radius is `calc()` / `clamp()` off those.

> **A slider should drive a *scale*, not a *value*.** The lab's TEXT and PAD are
> already this — multipliers over a whole family, not per-element controls. When
> you feel the urge to expose a leaf, that is the signal it should be *derived*:
> find its relationship to a knob, fold it into the formula, and remove the urge.

**Prior art worth stealing:** Utopia (fluid type + space from ~5 inputs),
Modular Scale (base + ratio), Tailwind / Open Props (curated finite scale —
constraint by design), Material 3 / Leonardo / Radix (ramps from a seed).
Throughline: **constrain the inputs, generate the outputs.**

**The workflow:** explore granular → discover relationships → collapse into
generators → expose only generators. The lab is the *explore* phase (every value
a hand-set leaf is fine here); tokenising is the *collapse* phase. The deliverable
deletes the leaf-level sliders and keeps the formulas.

## The generator recipe (theme-agnostic default)

This is the canonical knob set. Every theme instantiates the **same** generators
under its own prefix (`--<theme>-*`, e.g. `--pico-*`), so the technique is reused
across themes rather than reinvented. Resolved defaults:

| Knob | Default | Decision |
| --- | --- | --- |
| `--<t>-base` | `clamp(min, N·cqi, max)` | Fluid, container-anchored: type + space auto-scale with the screen. |
| `--<t>-type-ratio` | `1.25` | Major third — coarse enough for chunky UIs, general enough as a default. |
| `--<t>-space` | base space unit (em/rem) | Spacing derived as **linear** integer multiples (pixel-grid friendly). Geometric is opt-in. |
| `--<t>-text-scale` | `1` | Runtime multiplier over the whole type family (the lab TEXT; also a11y). Separate from base. |
| `--<t>-pad-scale` | `1` | Runtime multiplier over spacing/density (the lab PAD). Separate from space. |
| `--<t>-focus-min` | *(unset)* | Optional min interactive target; wire only when a theme adds a tier-3 / 10-foot seam. |

Colour is **not** a generator by default — themes alias a fixed/seeded palette as
primitives (pico uses the PICO-8 16). Add a hue/seed knob only if a theme needs
generated colour.

**Per-theme switches** (do not hardcode): crisp-snapping and linear-vs-geometric
space are theme choices, not global rules. Pico (a pixel-font, 8-bit theme) opts
into crisp snapping; a future theme with a normal font omits it and gets smooth
fluid sizing.

**Derived families** — CSS cannot exponentiate, so steps are spelled out. This is
exactly the `:root` half of the Tailwind two-layer pattern below, so the
prototype CSS ports to `@theme` with no restructuring:

```css
:root {
  /* Generators — the only knobs */
  --pico-base: round(clamp(8px, 2.5cqi, 22px), 1px); /* crisp opt-in: pixel font */
  --pico-type-ratio: 1.25;
  --pico-space: 0.5em;
  --pico-text-scale: 1;   /* lab TEXT */
  --pico-pad-scale: 1;    /* lab PAD  */

  /* Type scale: base * ratio^n * text-scale, snapped to px (pico only) */
  --pico-text--1: round(calc(var(--pico-base) / 1.25 * var(--pico-text-scale)), 1px);
  --pico-text-0:  round(calc(var(--pico-base) *  1      * var(--pico-text-scale)), 1px);
  --pico-text-1:  round(calc(var(--pico-base) *  1.25   * var(--pico-text-scale)), 1px);
  --pico-text-2:  round(calc(var(--pico-base) *  1.5625 * var(--pico-text-scale)), 1px);
  --pico-text-3:  round(calc(var(--pico-base) *  1.9531 * var(--pico-text-scale)), 1px);

  /* Space scale: linear steps * pad-scale */
  --pico-space-1: calc(var(--pico-space) * 1 * var(--pico-pad-scale));
  --pico-space-2: calc(var(--pico-space) * 2 * var(--pico-pad-scale));
  --pico-space-3: calc(var(--pico-space) * 3 * var(--pico-pad-scale));
  --pico-space-4: calc(var(--pico-space) * 4 * var(--pico-pad-scale));
}
```

`round()` is Baseline 2024. Use **px units inside `round()`** for pixel fonts
(avoids rem / zoom ambiguity). Components consume only the derived
`--<t>-text-*` / `--<t>-space-*` tokens — never the knobs directly.

## Porting to Tailwind v4 (wiring that survives contact)

The methodology lives in the `@theme` layer; utilities are a thin surface over
the generators. Tailwind v3's JS config fights this; v4's CSS-first model does
not. Verified specifics (Tailwind v4, 2024–2025):

- **Tokens are CSS vars.** `@theme { --text-lg: ...; --spacing-3: ... }` emits
  the variables *and* the utilities; `clamp()` / `calc()` / `cqi` / `round()`
  are legal values (the browser resolves them at paint).
- **Runtime knobs — mind the bug.** `@theme inline { --x: calc(var(--knob)*...) }`
  is **broken** (tailwindlabs/tailwindcss #16396). Use one of:
  - *two-layer (shadcn pattern):* compute in `:root`
    (`--text-lg-tok: calc(var(--_text-lg) * var(--text-scale))`), then
    `@theme inline { --text-lg: var(--text-lg-tok) }`; or
  - *single-layer:* plain `@theme { --text-lg: calc(<clamp> * var(--text-scale,1)) }`
    — regular `@theme` (not `inline`) passes `calc(var())` through.
- **Register the multipliers:** `@property --text-scale { syntax: "<number>";
  inherits: true; initial-value: 1; }` for reliable inheritance + animation.
- **Adaptation = container queries, never media.** `@container`, `@sm:` /
  `@max-*` variants, `cqi` units are native in v4 (`@container-size` for the
  block axis). Avoid `md:` / `lg:` viewport variants.
- **Ban arbitrary literals.** Enable `eslint-plugin-tailwindcss/no-arbitrary-value`
  so a value outside the scale is a lint error, not silent drift — this is the
  line between a design system and inline styles.
- **Reuse = component, not `@apply`.** Extract a component boundary for repeated
  *behaviour*; do not `@apply` for repeated *appearance* (CVA + `tailwind-merge`
  manage variant sprawl; both already in this repo).
- **Verified (Tailwind 4.2.4):** `calc(... * var(--knob,1))` inside a single-layer
  `@theme` stays runtime-live — flipping the knob rescaled the utility 16px->32px
  in a real build, and `round(clamp(...),1px)` passes through intact. Reproduce
  via `device-lab/spike/` (`bun build.mjs`).

Mental model: **CUBE CSS** — utilities are the atomic "U" layer over the token
generators; semantics / composition live above. Granularity becomes *semantic*
(`bg-surface`, `text-body`), and the ~5–7 knobs sit underneath, never read by
component code.

## Reusing across themes

This recipe is the default for **every** Korri theme, not just pico:

- Each theme picks a prefix (`--<theme>-*`) and instantiates the same ~5 knobs
  with its own values, choosing snap-vs-smooth and linear-vs-geometric space.
- The two runtime multipliers (`text-scale`, `pad-scale`) are the same vars the
  device-lab publishes at dev time and the theme exposes at ship time
  (accessibility / density). One surface, two lifecycles.
- Device facts stay at the boundary (the lab / physical sizing); themes consume
  only their container + their knobs.
- When this kit graduates out of `prototypes/`, this file travels with it as the
  canonical token-generator guide. (Raw research backing these decisions lives
  in `device-lab/research/`.)

## How the kit embodies this

- `DeviceFrame` sizes a screen to `widthMm × heightMm × pxPerMm` and makes it a
  query container. The design inside only ever reacts to that container.
- **Display fit (oversized devices, e.g. a TV):** a device physically larger
  than the monitor cannot be shown at 1:1. When the true frame exceeds
  `maxHeightPx` (the viewport height), the *whole frame* is `transform:
  scale()`d DOWN to fit. This is display-only: the screen keeps its true px
  size, so container queries resolve exactly as on the real panel — only the
  painted result shrinks (viewing from across the room). This is the *one*
  sanctioned transform-scale; handhelds that fit render untouched (k=1). Note a
  large physical screen makes a `cqi`-anchored base want a large value, so its
  content scale is governed by the base clamp MAX / per-device TEXT — a TV is
  often where a genuine tier-3 (10-foot) seam becomes warranted.
- The design under test is authored in container-relative units and reads the
  published scale custom properties (`--<scaleVarPrefix>-text-scale`,
  `--<scaleVarPrefix>-pad-scale`). No device identity reaches the design.
- `DeviceLab` lets you add / remove / resize devices live (persisted roster), so
  you can stress a single composition across many sizes and aspects and *see*
  where tier 1–2 stops sufficing and a tier-3 seam is genuinely warranted.
- `DeviceLab`'s optional `themeKnobs` prop exposes the theme's generators
  (base / min / max / ratio / space, ...) as a live GEN slider group. The lab
  persists them and applies each as its `cssVar` on the stage so it cascades
  into every screen; the theme CSS only reads `var(cssVar, <fallback>)`. This is
  the *explore* surface for dialing the scale by eye — bake the settled values
  into the CSS fallbacks and drop the knobs at ship time.

When you reach for a media query, stop: prefer container units (tier 1), then
auto-fit / flex-wrap reflow (tier 2), and only then a single, centralized,
token-driven container-query seam (tier 3).
