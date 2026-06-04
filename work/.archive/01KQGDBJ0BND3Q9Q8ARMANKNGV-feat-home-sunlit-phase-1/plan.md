---
title: "feat: HomeSunlit exploration — Phase 1 (home rail)"
type: feat
status: shipped
date: 2026-05-01
origin: ../../01KQDTYV32N1ERDVDGHCBZN6MY-shift-home-screen-visual-language/requirements.md
---

# feat: HomeSunlit exploration — Phase 1 (home rail)

## Overview

Build a third Storybook home-screen exploration (`Sunlit`, friendly) as a sibling to `Hero` and `Mosaic`. Phase 1 reproduces the resume moment of the Nintendo Switch 2 home cluster: a single horizontal rail with one wide landscape feature tile (the resume target) plus vertical 2:3 cover posters, framed by decorative status chrome at the top and a HUD + Menu pill at the bottom. The lavender focus halo, eyebrow + game-name caption, and faithful gamepad chrome are the load-bearing visual identifiers.

The exploration introduces no production wiring. The shared `HudButtons` component grows two backward-compatible props (action selection + glyph characters) so Sunlit can render Switch's `+ Options` glyph and omit `B Back` (which Switch's home does not surface) without breaking Hero or Mosaic.

## Problem Frame

Hero (cinematic) and Mosaic (Rams/minimal) argue against each other on a cinematic↔minimal axis. Living with both surfaced a real gap: neither captures *friendly, low-contrast, family-arcade* DNA — bright surfaces, soft rounding, a signature focus halo, gamepad chrome rendered as visible visual furniture rather than as discrete edge labels. Sunlit imports that language wholesale by cloning the Switch 2 home, used as a calibration anchor between the existing two poles.

(See origin: `../../01KQDTYV32N1ERDVDGHCBZN6MY-shift-home-screen-visual-language/requirements.md`, addendum.)

## Requirements Trace

Phase 1 satisfies addendum requirements R20–R32. Mapping:

- R20 (single Phase 1 story) → Unit 2
- R21 (heterogeneous rail via shipped Tilegrid rect-cell + colSpan API) → Unit 3
- R22 (resume target = first fixture, initial focus on mount) → Unit 3
- R23 (caption: green "LAST PLAYED" eyebrow when resume focused, name-only otherwise) → Unit 3
- R24 (lavender focus glow, `--focus-glow` token) → Unit 3
- R25 (decorative focusable search pill) → Unit 4
- R26 (decorative 5-element status cluster, aria-hidden) → Unit 4
- R27 (focusable Menu pill, no-op press) → Unit 4
- R28 (HUD: `+ Options · Ⓧ Close Software · A Continue`, no `B Back`) → Units 1 + 4
- R29 (HudButtons gains glyph props + action selection) → Unit 1
- R30 (story-local landscape art helper for feature tile only) → Unit 3
- R31 (light primary + dark mode) → Units 2 + 3 + 4 (token blocks)
- R32 (fluid tokens + container-type root) → Unit 2

## Scope Boundaries

- Out: Phase 2 (library grid) and Phase 3 (drawer overlay) — separate plans.
- Out: any change to the `Tilegrid` primitive. Phase 1 consumes `cellSize: { width, height }` + per-item column-only `span` already shipped on `TilegridRailRoot` (commits `5cec1a8` → `042e432`).
- Out: changes to `korri/products/app/**`, `korri/shared/themes/shift/fixtures/games`, or the `GameRecord` schema.
- Out: extracting any Sunlit-only token into the global design-system theme; tokens stay scoped to `[data-exploration="sunlit"]`.
- Out: real wiring for the search pill, Menu pill, or `Ⓧ Close Software` chip — all decorative or no-op.
- Out: animation choreography beyond focus crossfade and HUD glyph pulse-on-press.
- Out: a third kind of HUD chip API; the `Ⓧ` chip is rendered story-local, not added to `HudButtons`.

### Deferred to Separate Tasks

- Phase 2 (library grid with tab strip + L/R shoulder hints): captured in the brainstorm addendum's Phasing table; planned separately when Phase 1 ships.
- Phase 3 (side drawer overlay wired to the Menu pill): captured in the brainstorm addendum's Phasing table; planned separately.

## Context & Research

### Relevant Code and Patterns

- `korri/shared/design-system/explorations/home-screens/HomeHero.stories.tsx` and `HomeMosaic.stories.tsx` — the established sibling pattern. Mirror the file structure: `data-exploration="<variant>"` root attribute, scoped `<style>` block, `container-type: inline-size` on root, fluid Tailwind utilities, light/dark via `:root.dark`/`:root:not(.dark)` selectors, initial-focus `useEffect` on the resume target, `focusin` listener on the rail container reading `data-tile-id` for caption-following-focus.
- `korri/shared/design-system/explorations/home-screens/HudButtons.tsx` — existing shape; subscribes to `useInputAction("confirm" | "back" | "options")`, pulses glyph on press for `PULSE_MS` (220ms), `aria-hidden`, non-focusable. Class hooks: `.hud`, `.hud-hint[data-active]`, `.hud-glyph`, `.hud-label` are styled per-variant by each story's scoped CSS.
- `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.tsx` — Phase 1 consumes the rectangular `cellSize: { width, height }` overload + per-item column-only `getSpan`. Reference usage: `RailHeterogeneousDemo` in `korri/shared/design-system/components/Tilegrid/Tilegrid.stories.tsx` (around line 447) sets `cellSize={{ width: 155, height: 220 }}` with `featureSpan: 3`, deliberately calibrated to land the leading tile near 16:9 footprint at the same row height as 2:3 posters.
- `korri/shared/design-system/components/Tilegrid/components/TilegridCells.tsx` — `renderCell({ item, cellProps })`; `cellProps` includes `data-tile-id`, `tabIndex`, `aria-label`, and `style`. Cells are focusable buttons.
- `korri/shared/themes/shift/fixtures/games.ts` — 24 fixtures; `placeholderImage(seed)` returns `https://picsum.photos/seed/shift-${seed}/600/600` (square). Sunlit derives a `-wide` variant per fixture id for the feature tile only.
- `korri/shared/themes/shift/schemas/game.ts` — `GameRecord`, `getGameDisplayName`, `getGameImageUrl`. First fixture is `crystalline-drift` (most recent `lastPlayed`, 12min ago) — same resume target as Hero/Mosaic.
- `korri/shared/navigation/use-input-action.ts` — `useInputAction(action, handler)` semantic-action subscription used inside `HudButtons`.
- `korri/deploy/storybook/preview.tsx` — globally boots spatial nav and provides the light/dark color-mode toolbar. No story-local setup required.
- `korri/shared/design-system/components/Tilegrid/components/TilegridCells.test.tsx` — established RTL + `bun:test` + `happy-dom` pattern; HudButtons tests will mirror it.

### Institutional Learnings

- `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md` — Sunlit's root must declare `container-type: inline-size` and consume the existing fluid `--text-*` and `--spacing` tokens. Inline pixel sizes in `<style>` blocks bypass the theme.
- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — components stay native HTML (`button`, `[tabindex]`) and subscribe to semantic actions via `useInputAction`; do not reach into `window.__korriSpatialNav`. Static chrome (status cluster, decorative chips) is `aria-hidden` and non-focusable.
- `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md` — the rationale behind Tilegrid's two sibling Roots and column-only span axis on rail mode; Phase 1 stays inside the contract that primitive defines.
- `docs/solutions/best-practices/css-length-props-with-sentinel-resolution-2026-05-01.md` — `cellSize` accepts CSS length strings; numeric values are zero-cost. Phase 1 may use either; numeric is fine for the static cell size used here.

### External References

None needed. The Switch 2 home cluster source is the screenshots collected during the brainstorm; all implementation patterns are local.

## Key Technical Decisions

- **`HudButtons` extends, doesn't fork.** Add `actions?: readonly Action[]` (defaulting to `["confirm", "back", "options"]` so Hero and Mosaic stay byte-identical) plus `confirmGlyph` / `backGlyph` / `optionsGlyph` (defaulting to `A` / `B` / `Y`). The component subscribes only to actions present in the array — pulse-on-press for an omitted action would have no visible effect anyway, and the smaller subscription surface is cleaner. Render order follows the array order.
- **Sunlit instantiates `HudButtons` twice with a static chip between.** The Switch home HUD reads `+ Options · Ⓧ Close Software · A Continue` (left-to-right). The static `Ⓧ` chip is non-focusable and has no input bus subscription. Two `HudButtons` siblings (one with `actions={["options"]}`, one with `actions={["confirm"]}`) bracket the static chip — composition, not API expansion. (See origin R29.)
- **Heterogeneous rail uses Tilegrid rect-cell + `getSpan`, not a custom flex row.** The shipped API exists precisely for this case; calling `cellSize={{ width, height }}` with `getSpan: g => g.id === resume ? 3 : 1` produces a faithful one-row Switch-style rail with all tiles at the same row height. Reference: `RailHeterogeneousDemo` in `Tilegrid.stories.tsx`.
- **Story-local landscape art helper, no fixture or schema change.** Feature tile loads `https://picsum.photos/seed/shift-${id}-wide/1280/720`; posters keep their existing fixture URLs cropped to 2:3 with `object-fit: cover`. The `-wide` seed suffix yields a deterministic but distinct image so the feature tile reads as cinematic landscape art, not a center-cropped square. (See origin R30.)
- **Lavender halo behind a `--focus-glow` token.** Token lives at the variant root in both light and dark blocks. Tile focus styling references `var(--focus-glow)` so a future Korri brand pass can rebind without touching JSX.
- **Caption follows focus via the established `focusin` + `data-tile-id` pattern.** Mirror Mosaic's placard mechanism. No Tilegrid context extension needed.
- **Initial focus on resume target via `useEffect` + `data-tile-id` lookup.** Same pattern as Hero/Mosaic. The resume target is `games[0]` (`crystalline-drift`).
- **No tests for the story itself; tests for the shared component change.** Hero and Mosaic ship without unit tests; explorations are validated visually in Storybook. `HudButtons` is now a configurable shared component with three consumers, so behavioral tests are warranted there.

## Open Questions

### Resolved During Planning

- **`HudButtons` action-selection prop shape (deferred from brainstorm R29):** Resolved as `actions?: readonly ("confirm"|"back"|"options")[]`. The array form supersedes per-action booleans because (a) it controls render order alongside membership — Sunlit's two-instance composition relies on order matching the source — and (b) `actions: ["options"]` reads more naturally than `{showOptions: true, showConfirm: false, showBack: false}` for the omit-most case.
- **Cell sizing values for the rail:** Use the values calibrated in the existing `RailHeterogeneousDemo`: `cellSize={{ width: 155, height: 220 }}`, `gap: 8`, feature span `3`. These were specifically tuned for Switch-style proportions and validated visually in Tilegrid's own Storybook controls. Calibrate further during implementation if visual review demands.
- **Where the eyebrow + caption live:** Below the rail (matches Switch screen 1), not overlaid on the feature tile. Mirrors Mosaic's placard pattern with a story-local crossfade keyed on focused id.

### Deferred to Implementation

- **Exact lavender hex values for light + dark modes.** Pin during implementation by calibrating against the screenshots in `/tmp/clone-ui/`. Both values live behind `--focus-glow`.
- **Exact cream-grey surface and dark-mode surface hex values.** Pin during implementation; structure already mirrors Hero/Mosaic's two-mode token blocks.
- **Status-chrome icon stroke weights and final sizes** — `lucide-react` icons (`Sun`, `Wifi`, `Battery`, `Search`, `Menu`) sized via Tailwind utilities; iterate visually.
- **Whether the avatar circle needs an internal motif (single dot, soft gradient) to read as an avatar.** Try plain first; iterate if it reads as an empty fill.
- **Final rounding values for search pill, menu pill, and tile corners** — match source visually during implementation; expressed as Tailwind utility classes or CSS variables, not hardcoded pixels.
- **Whether the Storybook viewport list needs a Tablet preset specifically for Sunlit, or whether reusing Hero/Mosaic's preset list is sufficient.** Defer; Hero/Mosaic's preset list (1080p / 720p / Tablet / Handheld) is the right starting point.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Composition shape

```text
[data-exploration="sunlit"].sunlit-root          (container-type: inline-size)
├── <TopBar>                                     decorative
│   ├── <SearchPill>                             focusable, no-op
│   └── <StatusCluster>                          aria-hidden
│       ├── <BrightnessIcon>
│       ├── <Time>16:24</Time>
│       ├── <WifiIcon>
│       ├── <BatteryIcon>
│       └── <AvatarCircle>
│
├── <RailRegion ref=railRef>                     focusin -> setFocusedId
│   └── <TilegridRailRoot
│         items={items}
│         cellSize={{ width, height }}
│         getSpan={resume? 3 : 1}>
│       └── <TilegridCells
│             renderCell={item => item.id === resume
│                                  ? <FeatureTile />
│                                  : <PosterTile />}>
│
├── <Caption focusedId>                          green eyebrow when resume
│
└── <BottomBar>
    ├── <MenuPill>                               focusable, no-op
    └── <HudCluster>
        ├── <HudButtons actions=["options"] optionsGlyph="+" optionsLabel="Options">
        ├── <StaticChip glyph="X" label="Close Software">  aria-hidden
        └── <HudButtons actions=["confirm"]  confirmGlyph="A" confirmLabel="Continue">
```

### Focus → caption data flow

```text
TilegridCells emits data-tile-id on each cell button
       │
       ▼
focusin handler on RailRegion reads e.target.dataset.tileId
       │
       ▼
setFocusedId(id)
       │
       ▼
Caption renders { eyebrow: id === resume ? "LAST PLAYED" : null, name }
       │
       ▼
key={focusedId} on the inner element triggers a CSS crossfade animation
```

### `HudButtons` extension shape (directional)

```ts
type Action = "confirm" | "back" | "options"

interface HudButtonsProps {
  actions?: readonly Action[]              // default: ["confirm", "back", "options"]
  confirmLabel?: string                    // existing
  backLabel?: string                       // existing
  optionsLabel?: string                    // existing
  confirmGlyph?: string                    // new, default "A"
  backGlyph?: string                       // new, default "B"
  optionsGlyph?: string                    // new, default "Y"
}
```

Implementation should subscribe via `useInputAction` only for actions present in `actions`, render glyphs in `actions` order, and preserve the existing `aria-hidden`, pulse-on-press, and `data-active` behaviors.

## Implementation Units

- [x] **Unit 1: Extend `HudButtons` with action selection + glyph characters** — commit `1996623`

**Goal:** Make `HudButtons` configurable enough that Sunlit can render `+ Options` and `A Continue` (omitting `B Back`) while Hero and Mosaic continue to render `A Continue · B Back · Y Options` byte-identically. Lock the public API so Phases 2 and 3 can extend it without churn.

**Requirements:** R29.

**Dependencies:** None.

**Files:**
- Modify: `korri/shared/design-system/explorations/home-screens/HudButtons.tsx`
- Create: `korri/shared/design-system/explorations/home-screens/HudButtons.test.tsx`

**Approach:**
- Add `actions?: readonly Action[]` (default `["confirm", "back", "options"]`) and three optional glyph character props (`confirmGlyph` / `backGlyph` / `optionsGlyph` defaulting to `A` / `B` / `Y`).
- Subscribe via `useInputAction` only for actions present in `actions` — i.e., guard each subscription with `actions.includes("confirm")` etc. The pulse handler still owns the timer; the `pulse` state remains a single `Action | null`.
- Render hints by mapping over `actions`, so order in the rendered output matches order in the prop. Glyph and label come from the matching prop pair.
- Keep `aria-hidden`, the `.hud` / `.hud-hint[data-active]` / `.hud-glyph` / `.hud-label` class hooks, and the pulse cleanup `useEffect` unchanged.

**Patterns to follow:**
- The existing `HudButtons.tsx` shape and class-hook contract; per-variant styling stays in each story's scoped `<style>` block.
- `korri/shared/design-system/components/Tilegrid/components/TilegridCells.test.tsx` for the unit-test setup (`bun:test` + `@testing-library/react` + `happy-dom`).

**Test scenarios:**
- Happy path — Default render: with no `actions` prop, three `.hud-hint` elements render in the order `confirm / back / options` with glyphs `A / B / Y` and labels `Confirm / Back / Options`. Asserts Hero/Mosaic backward compatibility.
- Happy path — Custom labels preserved: passing `confirmLabel="Continue"` and default `actions` renders `Continue` next to the `A` glyph; other labels keep defaults.
- Happy path — Glyph customization: `confirmGlyph="A" optionsGlyph="+" actions={["options","confirm"]}` renders exactly two hints in order `options, confirm` with text content containing `+` then `A`.
- Edge case — Empty `actions` array renders no `.hud-hint` children but still renders the `.hud` container (so layout reservations don't shift).
- Edge case — `actions={["confirm"]}` with `confirmLabel="Continue"` renders exactly one hint; the `B` glyph and `Y` glyph are absent from the rendered output.
- Integration — Pulse on input event: dispatching the input bus's `confirm` action while `actions={["confirm"]}` toggles `data-active=""` on the rendered hint, then clears it after the pulse window. Use `act` + a fake timer or wait helper consistent with `TilegridCells.test.tsx`'s style.
- Integration — Filtered subscription: dispatching the input bus's `back` action while `actions={["confirm"]}` does *not* set `data-active` on any hint, because the component did not subscribe to `back`.
- Edge case — Cleanup on unmount: rendering with `actions={["options"]}`, dispatching `options`, then unmounting before the pulse timer fires must not throw or warn (existing cleanup `useEffect` covers this; assert via no `console.error` during the test).

**Verification:**
- `just test-unit` passes; the new `HudButtons.test.tsx` is part of the suite.
- `just typecheck` and `bun x biome check korri/shared/design-system/explorations/` clean.
- Visual inspection in Storybook: Hero and Mosaic render identically to before the change.

---

- [x] **Unit 2: Scaffold `HomeSunlit.stories.tsx` (root, tokens, viewport presets)** — commit `b841bb4`

**Goal:** Create the file, the `data-exploration="sunlit"` root, both color-mode token blocks, the `container-type: inline-size` declaration, and the Storybook meta with viewport presets. The story renders an empty surface with the cream-grey light background (or deep dark counterpart) — no rail, no chrome yet. This makes Units 3 and 4 purely additive.

**Requirements:** R20, R31, R32.

**Dependencies:** None (Unit 1 not strictly required for scaffold but should land first to keep the file's HudButtons import resolvable when Units 3–4 are added).

**Files:**
- Create: `korri/shared/design-system/explorations/home-screens/HomeSunlit.stories.tsx`

**Approach:**
- Mirror the file structure of `HomeHero.stories.tsx` and `HomeMosaic.stories.tsx`: file-level docblock, imports, top-level composition function, scoped `<style>` block helper, Storybook meta + default story export.
- Root element carries `data-exploration="sunlit"` and a `sunlit-root` class. `container-type: inline-size` is declared in the scoped CSS so the existing fluid `--text-*` and `--spacing` tokens scale against this surface.
- Define both token modes: light primary (warm cream-grey surface, dark ink) under `[data-exploration="sunlit"]`; dark counterpart (deep blue-black surface, light ink) under `:root.dark [data-exploration="sunlit"]`. Token names mirror Hero/Mosaic where they overlap (`--surface`, `--ink`, `--ink-dim`, `--ink-faint`, `--rule`) plus Sunlit-specific tokens: `--focus-glow`, `--last-played-eyebrow` (the green caption color), `--pill-bg`, `--pill-fg`.
- Storybook meta: `title: "Explorations/Home Screens/Sunlit (Friendly)"`, `parameters.layout: "fullscreen"`, `parameters.backgrounds.disable: true`, viewport list mirroring Hero/Mosaic (`fullhd` 1920×1080 default, `hd` 720p, `tablet` 900×1200, `handheld` 420×720).
- Default story exports an empty surface — verifies tokens, container type, and viewport switching before any content lands.

**Patterns to follow:**
- `korri/shared/design-system/explorations/home-screens/HomeMosaic.stories.tsx` end-to-end: scoped style block at the bottom with both color modes, Storybook meta shape, naming convention.
- `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md` rules: container-type on the surface root, no inline pixel font sizes, theme-variable references for color.

**Test scenarios:**
Test expectation: none — story scaffold has no behavioral surface; correctness is verified visually in Storybook.

**Verification:**
- `just dev-storybook` shows `Explorations / Home Screens / Sunlit (Friendly)` in the sidebar; the default story renders an empty cream-grey surface (light) or deep dark surface (dark) without console errors.
- Switching viewports (1080p / 720p / Tablet / Handheld) does not break layout; the surface fills the canvas in each.
- `just typecheck` clean.

---

- [x] **Unit 3: Heterogeneous rail with feature tile + posters + focus-driven caption** — commit `570fead`

**Goal:** Land the visual centerpiece: a `TilegridRailRoot`-driven row of one wide landscape feature tile (the resume target with cinematic 16:9 art) followed by vertical 2:3 cover posters, all sharing row height. Lavender focus halo on the focused tile. Initial focus on the resume target. A caption region below the rail mirrors focus, showing a green "LAST PLAYED" eyebrow + name when the resume target is focused, name only otherwise.

**Requirements:** R21, R22, R23, R24, R30.

**Dependencies:** Unit 2 (root + tokens).

**Files:**
- Modify: `korri/shared/design-system/explorations/home-screens/HomeSunlit.stories.tsx`

**Approach:**
- Define the resume convention story-local: `const resumeTarget = games[0]` (same as Hero/Mosaic). Type the items list as `ReadonlyArray<GameRecord>` — no `span` field on items; `getSpan` resolves it inline (`item.id === resumeTarget.id ? 3 : 1`).
- Mount a `TilegridRailRoot<GameRecord>` with `cellSize={{ width: 155, height: 220 }}`, `gap: 8`, `getSpan` per above, `getKey: g => g.id`, `getAriaLabel: getGameDisplayName`. Wrap in a `RailRegion` div carrying a `ref` and the `focusin` listener that mirrors Mosaic's pattern (read `e.target.dataset.tileId`).
- `renderCell` branches on `item.id === resumeTarget.id`: feature tile renders `<FeatureTile game={item} {...cellProps} />` (loads landscape art via the helper, see below); poster tile renders `<PosterTile game={item} {...cellProps} />` (loads `getGameImageUrl(item)` cropped 2:3 with `object-fit: cover`).
- Story-local landscape helper: `featureArtUrl(id) = "https://picsum.photos/seed/shift-" + id + "-wide/1280/720"`. Apply with `loading="lazy"`. Posters use `getGameImageUrl(g)`.
- Lavender focus glow: in the scoped `<style>` block, define `--focus-glow` for both modes; tile focus state applies `box-shadow: 0 0 0 2px var(--focus-glow), 0 0 18px 6px var(--focus-glow)` (or similar — calibrate visually) on `:focus-visible`. Suppress Storybook's global ring.
- Initial focus: `useEffect` on mount queries `[data-tile-id="<resumeTarget.id>"]` (escaped via `CSS.escape`) and calls `.focus()`. Same shape as Hero/Mosaic.
- Caption region: render below the rail with the focused game's display name. When `focusedId === resumeTarget.id`, show a green `LAST PLAYED` eyebrow above the name (uses `--last-played-eyebrow` token); otherwise omit the eyebrow. Apply `key={focusedId}` to the inner caption element so re-mount-on-change triggers a CSS crossfade animation defined in the scoped block (mirrors Mosaic's placard cross-fade).

**Patterns to follow:**
- `korri/shared/design-system/explorations/home-screens/HomeMosaic.stories.tsx`: `useState<string>(resumeTarget.id)`, `focusin` listener wiring, initial-focus `useEffect`, `key={focusedId}` placard crossfade.
- `RailHeterogeneousDemo` in `korri/shared/design-system/components/Tilegrid/Tilegrid.stories.tsx` (around line 447): rectangular `cellSize`, per-item `span` resolution, single-row layout.

**Test scenarios:**
Test expectation: none — visual exploration; the established pattern (Hero, Mosaic) ships without unit tests. Behavior covered indirectly: the `HudButtons` test in Unit 1 covers shared-component changes; rail and focus mechanics are covered by `Tilegrid` unit tests in `korri/shared/design-system/components/Tilegrid/`. Verification is visual.

**Verification:**
- `just dev-storybook` → `Explorations / Home Screens / Sunlit (Friendly)`: the landscape feature tile renders on the left, posters trail to the right, all sharing row height.
- Initial focus is on the feature tile; lavender halo visible on it; eyebrow `LAST PLAYED` (green) plus `Crystalline Drift` caption visible below.
- Pressing right (gamepad or arrow key) moves focus to the next poster; halo follows; caption updates to that game's name; eyebrow disappears. Pressing left returns focus to the feature tile; eyebrow returns. Crossfade animates between captions.
- Light/dark toggle: surface, ink, halo, and eyebrow read correctly in both modes.
- Viewports 1080p, 720p, Tablet, and Handheld: rail scrolls horizontally, no overflow into surrounding chrome regions, type breathes with container size.
- `just typecheck` and biome check clean.

---

- [x] **Unit 4: Chrome — top bar (search + status), bottom bar (Menu pill + HUD)** — commit `feb1867`

**Goal:** Surround the rail and caption with the faithful Switch-style chrome. Top bar carries a focusable decorative search pill on the left and a 5-element status cluster on the right. Bottom bar carries a focusable decorative Menu pill on the left and a HUD on the right composed of two `HudButtons` instances bracketing a story-local static `Ⓧ Close Software` chip.

**Requirements:** R25, R26, R27, R28.

**Dependencies:** Unit 1 (extended `HudButtons`), Unit 2 (root + tokens). Unit 3 is recommended-before but not strictly required (the chrome would render around an empty rail region otherwise).

**Files:**
- Modify: `korri/shared/design-system/explorations/home-screens/HomeSunlit.stories.tsx`

**Approach:**
- Top bar: a horizontal flex row with the search pill on the left (~40% width) and the status cluster on the right.
  - **Search pill:** a `<button>` with the lucide `Search` icon and placeholder text "Search for games, genres, or tags…". Focusable (so the spatial-nav graph reflects the real surface), `onClick` is a no-op. Pill rounding via Tailwind `rounded-full`. Gets the lavender focus halo on focus-visible (reuses the same token, scoped selector).
  - **Status cluster:** a horizontal row, `aria-hidden`, non-focusable. Contains `lucide-react` `Sun`, a static `<span>16:24</span>`, `Wifi`, `Battery`, and a neutral-toned avatar circle (a `<div>` with `rounded-full` + a token-bound fill, no Kirby).
- Bottom bar: a horizontal flex row with the Menu pill on the left and the HUD cluster on the right.
  - **Menu pill:** a `<button>` with the lucide `Menu` icon + label "Menu". Pill rounding; token-bound `--pill-bg` / `--pill-fg`. Focusable; `onClick` is a no-op for Phase 1 (Phase 3 will wire it). Gets the lavender focus halo on focus-visible.
  - **HUD cluster:** a row containing, in order: `<HudButtons actions={["options"]} optionsGlyph="+" optionsLabel="Options" />`, then a story-local `<StaticHudChip glyph="X" label="Close Software" />` (a presentational sibling, `aria-hidden`, no input bus subscription), then `<HudButtons actions={["confirm"]} confirmGlyph="A" confirmLabel="Continue" />`.
- All chrome icons use `lucide-react` (already in `package.json`). Size icons via Tailwind utility classes consuming the fluid `--text-*` token where appropriate, or fixed `size` props calibrated visually.
- Token additions in the scoped `<style>` block: `--pill-bg`, `--pill-fg` for both modes; `--avatar-bg` for both modes. Hud styling reuses Hero/Mosaic's `.hud-glyph` / `.hud-label` class hooks but with Sunlit-specific colors (cream chip + dark glyph in light mode; dark chip + light glyph in dark mode).
- Layout: the surface uses a column flex layout (`top bar`, `flex-1` middle region holding rail + caption, `bottom bar`). Top and bottom bars are fixed-height; middle region absorbs the rest.

**Patterns to follow:**
- `HomeHero.stories.tsx` HUD region: top-right pill with backdrop-blur — Sunlit's chrome is structurally simpler (no blur), but the class-hook contract for HudButtons is the same.
- `HomeMosaic.stories.tsx` placard layout: the bottom bar's flex composition is similar in structure (left meta + right HUD).
- `korri/products/app/routes/+index.tsx` and existing app components — only as a reference for `lucide-react` icon import patterns; not a structural pattern to follow.

**Test scenarios:**
Test expectation: none — chrome is decorative + presentational; the only behavioral surface (HudButtons subscriptions and pulse) is covered by Unit 1's tests.

**Verification:**
- `just dev-storybook`: chrome elements render in the right positions at 1080p — search pill top-left, status cluster top-right, Menu pill bottom-left, HUD bottom-right; all five status elements visible.
- Spatial navigation: starting from the feature tile (the initial focus from Unit 3), pressing `up` reaches the search pill; pressing `down` reaches the Menu pill. Pressing `right` from the Menu pill reaches no focusable chrome (HUD is aria-hidden) — focus stays on Menu pill. Search pill and Menu pill both show the lavender halo on focus.
- HUD pulse-on-press: pressing the gamepad's confirm action (or its keyboard equivalent) flashes the `A` glyph; pressing `options` flashes the `+` glyph; pressing `back` does not affect the visible HUD (back was not subscribed in Sunlit's two `HudButtons` instances).
- Light/dark toggle: chrome elements re-color correctly in both modes.
- `just typecheck` and biome check clean.

## System-Wide Impact

- **Interaction graph:** Phase 1 adds two new focusable, presentational chrome buttons (search pill, Menu pill) to the spatial-nav graph alongside the rail. Both have no-op handlers and no semantic actions wired beyond what `useInputAction` provides globally. No new global handlers, no new event sources.
- **Error propagation:** None. The exploration has no failure modes to propagate; image fetch failures fall back to broken-image rendering (acceptable for a Storybook exploration). The `HudButtons` subscription change reduces the number of input-bus listeners when `actions` filters them out — strictly fewer, never more.
- **State lifecycle risks:** None new. `HudButtons`'s pulse timer cleanup is preserved (existing `useEffect`). The story's `focusin` listener is added in `useEffect` with a matching teardown, mirroring Hero/Mosaic.
- **API surface parity:** `HudButtons` gains four optional, backward-compatible props. Hero (`korri/shared/design-system/explorations/home-screens/HomeHero.stories.tsx`) and Mosaic (`HomeMosaic.stories.tsx`) consume `HudButtons` and must continue rendering byte-identically — verified by Unit 1's first test scenario and visual confirmation. No other consumers exist.
- **Integration coverage:** Unit 1's pulse-on-input-event test exercises the cross-layer integration (input bus → `useInputAction` → `HudButtons` state → DOM `data-active`). The story's spatial-navigation behavior (initial focus, focusin propagation to caption) is verified visually in Storybook; this matches Hero/Mosaic's verification posture.
- **Unchanged invariants:**
  - `Tilegrid` primitive — no API changes. Phase 1 consumes the rectangular cell + per-item colSpan support already shipped.
  - `GameRecord` schema — no changes. The `-wide` art URL is derived inside the story, never written back to fixtures.
  - Fixtures — no changes. Same 24 games, same first-fixture-as-resume convention.
  - `korri/products/app/**` — untouched.
  - Hero and Mosaic explorations — visually unchanged (verified by Unit 1's defaults-preserved test).
  - Design-system theme (`korri/shared/design-system/theme/styles.css`) — untouched. Sunlit-specific tokens stay scoped to `[data-exploration="sunlit"]`.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `HudButtons` extension subtly changes Hero/Mosaic rendering (e.g., glyph order, default labels, listener registration timing) | Unit 1's first test scenario asserts the default render is unchanged; visual confirmation in Storybook for both Hero and Mosaic before merging. |
| Picsum's `-wide` seed yields imagery that doesn't read as "game key art" and undermines the cinematic intent | Visual review during implementation; if the helper produces poor results for any specific resume target, switch to a different seed pattern (e.g., `-wide-2`) or accept that aesthetic — the requirement is *cinematic landscape*, not *real game art*. |
| Calibrated cell sizes (155×220, span 3) don't reproduce the source's hero proportions closely enough | Adjust `cellSize.width` (try 150–170), `cellSize.height` (try 210–240), or `getSpan` for the resume target (try 3 vs 4) during implementation; the API change isn't blocked by exact numbers. |
| Lavender halo color reads too aggressive at TV viewing distance, or too anemic at handheld distance | Token-bound (`--focus-glow`); iterate visually across the four viewport presets before merging. |
| Spatial navigation lands in unexpected places given the new focusable chrome (search pill, Menu pill) | Verify the focus path manually in Storybook with a gamepad/keyboard at 1080p; document any surprising paths in the brainstorm's Phase 2/3 deferred-questions section. |
| `lucide-react` icon styling drifts from the source's lighter, friendlier strokes | Calibrate `strokeWidth` per icon during implementation; if lucide's defaults read too heavy, override per icon. Out-of-scope to swap icon libraries. |

## Documentation / Operational Notes

- No production rollout. The exploration is Storybook-only.
- No documentation changes required for this phase. The brainstorm addendum already captures the Phase 1 scope and the phased delivery plan; once Phases 2 and 3 land, the addendum's Phasing table will reflect actual completion.
- If Sunlit lands as the production direction (a separate decision after living with all three explorations), a new `docs/solutions/best-practices/` learning may be warranted to capture how the heterogeneous rail + chrome cluster pattern was structured. Defer until that decision is made.

## Sources & References

- **Origin document:** `../../01KQDTYV32N1ERDVDGHCBZN6MY-shift-home-screen-visual-language/requirements.md` (addendum: Variant C — Sunlit (Friendly), added 2026-05-01).
- **Sibling explorations:** `korri/shared/design-system/explorations/home-screens/HomeHero.stories.tsx`, `korri/shared/design-system/explorations/home-screens/HomeMosaic.stories.tsx`.
- **Shared component to extend:** `korri/shared/design-system/explorations/home-screens/HudButtons.tsx`.
- **Tilegrid usage reference:** `korri/shared/design-system/components/Tilegrid/Tilegrid.stories.tsx` `RailHeterogeneousDemo` and `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.tsx` for the rectangular cell + colSpan API contract.
- **Test pattern reference:** `korri/shared/design-system/components/Tilegrid/components/TilegridCells.test.tsx`.
- **Institutional learnings:** `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md`, `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`, `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md`.
- **Source screenshots:** `/tmp/clone-ui/2026-05-01T09:38:35.png` (home, resume focused), `/tmp/clone-ui/2026-05-01T09:39:33.png` (home, focus shifted), `/tmp/clone-ui/2026-05-01T09:39:58.png` (drawer — Phase 3 reference, not Phase 1), `/tmp/clone-ui/2026-05-01T09:41:28.png` (library — Phase 2 reference, not Phase 1).
