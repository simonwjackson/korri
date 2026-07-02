# pico surface

An 8-bit / pixel-art **pico** theme (PICO-8 palette) for a range of devices —
handheld (Anbernic RG353M) through larger lean-back panels (Ayn Odin / "Thor"-
class) — authored with **intrinsic web design**: fluid sizing via container
queries + `cqi`/`cqh` units + `em`, driven by a small set of generator tokens,
each screen rendered at its **true physical size in mm**.

Pico is a real Korri surface, developed and viewed entirely in the **device
lab** (`tools/theme-workshop/`). There is no separate standalone gallery route;
the lab is the single home. The methodology + rationale for intrinsic design
live in **`device-lab/AGENTS.md`** — read that first.

## How to view

```bash
just dev-theme-workshop   # serves the workshop viewer; open the printed URL
```

Pico is registered in the lab via `tools/theme-workshop/themes.ts` (it exports
`picoConfig` from `config.tsx`). Every part — atom → molecule → organism →
template → page — is discovered by the lab (`*.part.tsx` co-located with each
component, plus the page screens surfaced through `config.tsx`). Fake data lives
in `fixtures.ts` + `fixtures-extra.ts`.

## Atomic structure

- `ui/atoms`, `ui/molecules`, `ui/organisms`, `ui/templates` — the reusable kit,
  each component with a `.part.tsx` catalog entry and a `.story.tsx`.
- `pages/**` — screens (grouped by feature) that compose the kit; surfaced in the
  lab as page-layer stories via `config.tsx` / `screen-catalog.tsx`.
- Every part carries `data-korri-part/layer/name` tags (see `pico-design-parts.ts`)
  so the lab can pick it. Composed-root parts (`List`, `KeyArtBackdrop`,
  `ScreenShell`, `PicoArtImage`, `renderPicoCart`) accept a `partAttrs` override so
  a composing part claims the shared root without adding a wrapper.
- The routed surface the lab mounts is `VariantCartridgeShelf` (home) +
  `VariantGameDetail` (game detail), wired against the live catalog atoms.

## The calibration desk (`device-lab/`)

A reusable, template-agnostic harness. The toggle (top-left gear) opens a tabbed
panel:

- **Scale** — calibrate the monitor once: drag SCALE until the dashed box
  matches a real credit card (true px/mm).
- **Devices** — each device defined by real **mm** (W×H) + per-device **TEXT** /
  **PAD** multipliers. Seeds: RG353M, THOR, ODIN 2 PORTAL at 6.78 px/mm.
- **Generators** — the theme's scale knobs: **BASE** (cqi anchor), **MIN** /
  **MAX** (clamp bounds), **RATIO** (type scale), **SPACE** (space unit).
- **export** — copies current values as NDJSON to bake back into the seeds.

State persists per browser under `pico:lab`; **reset** restores the code seeds.

## Token system (the design's source of truth)

~6 generators compute the whole scale; components never hard-code sizes. In
`pico-prototype.css` on `.pico-screen`:

- `--pico-base = round(clamp(MIN, BASE·cqi, MAX), 1px)` — crisp pixel font.
- type steps `--pico-text--3 … --pico-text-3` = `base · RATIO^n · text-scale`.
- space steps `--pico-space-1 … 4` = `SPACE · n · pad-scale`.

`--pico-text-scale` / `--pico-pad-scale` are set inline per device by the lab
(the TEXT / PAD sliders).

## Gotchas

- **Inline `style={{...}}` beats class state.** A row's inline `background` /
  `color` overrides its `.sel` highlight — keep button base styles in CSS, not
  inline.
- Big art must derive from `--pico-base` (`min(<cqh>, calc(var(--pico-base) *
  N))`), never a raw unbounded `cqh`/`cqw` on a leaf, so art shares the type
  scale's ceiling.
