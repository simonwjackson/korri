# pico theme — prototype

**THROWAWAY.** UI prototype (se-prototype). Delete this whole directory and the
`/pico-prototype` route once a direction wins. The reusable `device-lab/` kit is
the one part worth graduating, not discarding (see below).

## What this is

An exploration of a new 8-bit / pixel-art **pico** theme (PICO-8 palette) for a
range of devices — handheld (Anbernic RG353M) through larger lean-back panels
(Ayn Odin / "Thor"-class) — viewed on a **physical-size calibration desk**
(`device-lab/`).

> **Major reversal worth knowing:** this started "pixel-perfect, locked to
> 640×480." That was **deliberately abandoned** in favour of **intrinsic web
> design** — fluid sizing via container queries + `cqi`/`cqh` units + `em`,
> driven by a small set of generator tokens, with each screen rendered at its
> **true physical size in mm**. The methodology + rationale live in
> **`device-lab/AGENTS.md`** — read that first.

## How to view

Standalone, no backend (recommended — the full portal stack is flaky here):

```bash
just dev-pico        # serves the standalone viewer; open the printed URL
```

Or inside the real portal (`just dev`): `/pico-prototype`.

### The state gallery

The prototype is now a **max-out state gallery**: ~74 screens covering every
state the theme can be in — current Korri *and* plausible future — each directly
reachable, nothing wired into flows. Navigate with the floating bottom bar
(`◀ / ▶`), the `←/→` arrow keys, the **`M`** key (or the `MAP` button) for the
grouped **STATE MAP** jump panel, or `?screen=<id>` on the route.

Groups (`screen-catalog.tsx` is the single source of truth): **Library, Detail,
Acquire, Session, In-Game, Settings, Multi-Device, System, Future.** Each group
lives in `screens/<Group>Screens.tsx` + `screens/<group>.css`; every screen
composes from the shared `screens/kit.tsx` (Screen/Title/Btn/List/Row/Card/Modal/
Progress/Toggle/Tabs/Stat/Badge/Hero/Spinner/…) over the shared `pc-*` CSS atoms.
Fake data lives in `fixtures.ts` + `fixtures-extra.ts`.

**Adding a screen:** author it in a group file, import it in `screen-catalog.tsx`,
add a `PicoScreen` entry. Intrinsic-design contract for every screen: type from
`--pico-text-*`, space from `--pico-space-*`, big art via `min(<cqh>,
calc(var(--pico-base) * N))` — never inline `font-size`, never a raw runaway
`cqh`/`cqw` on a leaf, selection state in CSS classes only.

## The calibration desk (`device-lab/`)

A reusable, template-agnostic harness. The toggle (top-left gear) opens a tabbed
panel:

- **Scale** — calibrate the monitor once: drag SCALE until the dashed box
  matches a real credit card (true px/mm). Card target only shows on this tab.
- **Devices** — each device defined by real **mm** (W×H) + per-device **TEXT** /
  **PAD** multipliers; add / remove / rename. Seeds: RG353M, THOR, ODIN 2 PORTAL
  at 6.78 px/mm (calibrated on the dev monitor).
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
(the TEXT / PAD sliders). Tailwind v4 `@theme` port is de-risked — see
`device-lab/spike/`.

## The five pages

- **A — Home** (`VariantCartridgeShelf`): hero cartridge coverflow, big title +
  stats. Art-forward.
- **B — Settings** (`VariantSettings`): category list + detail controls.
- **C — Browse** (`VariantIconGrid`): console "home OS" icon grid + focus tray.
- **D — Game Detail** (`VariantGameDetail`): the page reached by selecting a
  game. First real **tier-3 art-direction seam** — one `@container
  (min-aspect-ratio: 16/10)` flips stacked (handheld) ↔ split hero (lean-back),
  keyed off the device's true aspect ratio (monitor-calibration independent).
- **E — In-Game** (`VariantInGame`): pause / quick-menu overlay shown DURING a
  session. A session may be local or streamed → the SRC badge toggles
  STREAM⇄LOCAL and the live-stats strip swaps.

## Where we left off (resume here)

- **Cart sizing fix landed on D only.** A raw unbounded `cqh` cart ran away on
  big screens because the type scale is clamped but the cart wasn't. Fixed by
  deriving the cart from `--pico-base` (`min(74cqh, calc(var(--pico-base)*12))`),
  so cart + text share one ceiling. This made **MAX the A↔B dial**: low MAX →
  content plateaus + whitespace (B); high MAX → scaled-up handheld (A). Verified
  live (cart 132/264/312 at MAX 200 vs 132/216/216 at MAX 18 across the seeds).
- **OPEN — propagate the bounded-token fix to A / C / E** (Home & Browse carts
  almost certainly still have raw `cqh`/`cqw` leaves). Tracked in backlog
  **task-013**.
- **OPEN — pick the A vs B character**: dial MAX across the three real devices,
  decide the sweet spot, `export`, and bake into the CSS fallbacks +
  `PICO_KNOBS` / `PICO_DEVICES` seeds.
- **OPEN — pick the winning Home direction** (A / C, possibly steal from each).
- **THEN — graduate**: fold the winner into a real `product/themes/pico/`
  (Tailwind v4 `@theme`), register in `theme-registry.ts`; lift `device-lab/`
  out of `prototypes/` to a shared dev surface; delete this dir + its hooks
  (route, `/pico-prototype` line in `routes/__virtual.ts`, `dev-pico` recipe).

## Verdict (fill in after review)

- Home winner: _TBD_
- A vs B scaling character: _TBD (the MAX sweet spot)_
- Steal-from-others: _TBD_

## Gotchas

- **Inline `style={{...}}` beats class state.** A row's inline `background` /
  `color` overrides its `.sel` highlight — keep button base styles in CSS, not
  inline (re-hit twice: Settings rows, In-Game menu).
- **`just typecheck` currently fails** on unrelated pre-existing repo drift
  (`sessiond` / `foreground-launch` files) — none of it is pico/device-lab.
  Validate prototype work with `bunx biome lint product/apps/portal/prototypes/pico`.
