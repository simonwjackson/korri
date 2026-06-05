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

## Using this with Tailwind (v4)

Compatible, and helpful — provided you keep the methodology in the `@theme`
layer. Tailwind v3's JS config fights this; v4's CSS-first model does not.

- **Your tokens are CSS vars.** `@theme { --text-lg: …; --spacing-3: … }` emits
  the variables *and* the utilities, so the token tier is the Tailwind theme.
- **Generators live in `@theme`.** Use `clamp()` / `calc()` / `cqi` values:
  `--text-lg: calc(clamp(…) * var(--pico-text-scale, 1))`. Changing one runtime
  var (the lab's TEXT / PAD knob) re-scales the entire `text-*` / spacing family
  while you still use plain utilities. This is the bridge: lab knobs feed
  `@theme`.
- **Use container queries + intrinsic utilities.** `@container` variants,
  `grid-cols-[repeat(auto-fit,minmax(…))]`, `flex-wrap`, arbitrary `cqi` values.
- **Ban responsive breakpoint variants** (`md:` / `lg:`) — those are media
  queries, the anti-pattern. Decline the lazy path Tailwind offers.

Net: the methodology lives in `@theme`; utilities are a thin ergonomic surface
over the generators.

## How the kit embodies this

- `DeviceFrame` sizes a screen to `widthMm × heightMm × pxPerMm` and makes it a
  query container. The design inside only ever reacts to that container.
- The design under test is authored in container-relative units and reads the
  published scale custom properties (`--<scaleVarPrefix>-text-scale`,
  `--<scaleVarPrefix>-pad-scale`). No device identity reaches the design.
- `DeviceLab` lets you add / remove / resize devices live (persisted roster), so
  you can stress a single composition across many sizes and aspects and *see*
  where tier 1–2 stops sufficing and a tier-3 seam is genuinely warranted.

When you reach for a media query, stop: prefer container units (tier 1), then
auto-fit / flex-wrap reflow (tier 2), and only then a single, centralized,
token-driven container-query seam (tier 3).
