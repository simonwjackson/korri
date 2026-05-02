---
date: 2026-05-01
topic: shift-theme-atomic-decomposition
---

# Shift Theme — Atomic Decomposition

## Problem Frame

The Sunlit home-screen exploration (`korri/shared/design-system/explorations/home-screens/HomeSunlit.stories.tsx`, 872 lines, single file) successfully resolved the visual-language question opened by the earlier "Hero vs Mosaic" exploration (`docs/brainstorms/2026-04-30-shift-home-screen-visual-language-requirements.md`). The voice is decided. The exploration is done.

What's now blocking iteration:

- The visual identity is named "Sunlit" inside the file but should be **"Shift"** — the established theme name in this project (re-emerging after the cleanup in commit `85ce4f5 chore(themes): drop the shift theme`).
- The file is a single 872-line story with all state, layout, art, chrome, tokens, and styles co-mingled. Iterating on one piece (e.g., the rail caption) requires reading the rest.
- The current `korri/shared/design-system/` folder is misnamed: it contains theme-agnostic primitives (Tilegrid, ui/Button, hooks), not a "design system." A real design system would also contain themes; this folder explicitly does not.
- The placeholder route at `korri/products/app/routes/+index.tsx` is a bare `TilegridScrollRoot` demo unrelated to Shift. The Shift home is not yet the actual product home.

The dropped-theme commit (`85ce4f5`, 2026-05-01) is the bedrock context: a previous `themes/shift/` folder was deleted because it had grown into a mix of (a) shift-specific styles, (b) generic infra masquerading as theme code, and (c) fixtures. The lesson: **a theme contains only what is identity-bearing**; primitives and fixtures live elsewhere. This brainstorm reintroduces a Shift theme, deliberately respecting that boundary.

This brainstorm decides **structure and naming**: where the Shift theme lives, how it's organized internally, what gets renamed, and what graduates out of `explorations/`.

## Requirements

**Folder rename and high-level layout**

- R1. Rename `korri/shared/design-system/` to `korri/shared/primitives/`. The contents are theme-agnostic structural building blocks (Tilegrid, ui/Button, lib hooks) — "primitive" matches both their nature and the existing `radix-ui` vocabulary in this repo.
- R2. The current `korri/shared/design-system/theme/styles.css` (project-wide baseline: focus ring, cursor-none, foreground-muted token, fluid spacing/type scales) stays at `korri/shared/primitives/theme/styles.css`. It is not a Shift concern; it applies project-wide regardless of theme.
- R3. Introduce `korri/shared/themes/shift/` as the home of the Shift theme. The folder contains tokens and the full atomic structure of Shift's visual identity. It contains nothing else (no fixtures, no generic infra, no shared utilities).

**Internal structure of `themes/shift/`**

- R4. Organize Shift internally by **atomic-design level**, not by widget. The five canonical levels each get a folder:
  ```
  themes/shift/
    shift.css
    atoms/
    molecules/
    organisms/
    templates/
    pages/
  ```
- R5. Tokens live in a single CSS file (`shift.css`) at the theme root. No separate `tokens/` folder. Tailwind v4 `@theme` blocks are used for tokens that should produce Tailwind utilities; scoped CSS variables cover theme-only tokens (e.g., `--surface`, `--focus-glow`, `--hud-glyph-bg`). Light and dark variants follow the existing `:root` / `:root.dark` pattern in `primitives/theme/styles.css`.
- R6. Component files inside the theme are prefixed `Shift*` (e.g., `ShiftPill`, `ShiftHudGlyph`). Surfaces that may grow siblings (home, library, settings, drawer) get an additional surface qualifier: `ShiftHome*`. Use `ShiftHome*` for the home surface from the start so a future `ShiftLibrary*` does not require renaming.
- R7. Inside the theme, the React skill's flat widget shape (`<Widget>Root.tsx` + `components/`) is the **fallback within a single stateful widget**, not the top-level organizing principle. The top-level organizing principle is atomic level. A future stateful widget under any atomic-level folder may use the React skill's flat shape internally.

**Atomic decomposition of the current Sunlit home**

- R8. Decompose the current `HomeSunlit.stories.tsx` into the following pieces, each in its own file under `themes/shift/<level>/`:

  | Level | File | Source in current `HomeSunlit.stories.tsx` |
  |---|---|---|
  | tokens | `shift.css` | `SunlitStyles` (the entire scoped style block, ~250 lines) |
  | atoms | `ShiftPill.tsx` | base `.sunlit-pill` shape (rounded, focus halo) |
  | atoms | `ShiftTile.tsx` | base `.sunlit-tile` shape (rounded, ::after focus ring, transform) |
  | atoms | `ShiftHudGlyph.tsx` | the dark glyph circle (`.hud-glyph`) |
  | atoms | `ShiftAvatar.tsx` | `.sunlit-avatar` |
  | atoms | `ShiftStatusIcon.tsx` | `.sunlit-status-icon` wrapper |
  | molecules | `ShiftSearchPill.tsx` | `SearchPill` (icon + collapsible placeholder, focus expansion) |
  | molecules | `ShiftHudChip.tsx` | `StaticHudChip` (glyph + label, no input wiring) |
  | molecules | `ShiftHudButton.tsx` | input-bus-subscribed chip (extracted from current `HudButtons.tsx`) |
  | molecules | `ShiftMenuButton.tsx` | `MenuButton` |
  | molecules | `ShiftStatusCluster.tsx` | `StatusCluster` |
  | molecules | `ShiftHomeCaption.tsx` | `Caption` (focused title + relative time, x-snap) |
  | molecules | `ShiftHomeFeatureTile.tsx` | `FeatureTileArt` wrapped in a tile |
  | molecules | `ShiftHomePosterTile.tsx` | `PosterTileArt` wrapped in a tile |
  | organisms | `ShiftHomeTopBar.tsx` | `TopBar` (search + status cluster) |
  | organisms | `ShiftHomeRail.tsx` | the rail region (`TilegridRailRoot` + cells + delegated focus listener) |
  | organisms | `ShiftHomeBottomBar.tsx` | `BottomBar` (menu button + HUD cluster) |
  | organisms | `ShiftHomeHudCluster.tsx` | `HudCluster` (Options + Close + Continue) |
  | templates | `ShiftHomeRoot.tsx` | the outer layout + Provider; owns `focusedId`, `captionX`, `railRef` |
  | templates | `ShiftHome.context.tsx` | context contract + `useShiftHome()` hook |
  | pages | `ShiftHomePage.tsx` | composition root: picks data source (fixture games), mounts Root, assembles the tree |
  | pages | `ShiftHomePage.stories.tsx` | Storybook story for the page |

- R9. The page-level state currently held in `HomeSunlit` (`focusedId`, `captionX`, the focusin and scroll/resize effects) lives in `ShiftHomeRoot` (the template). Children read it via `useShiftHome()`. No prop-drilling.
- R10. The current `HudButtons.tsx` (subscribed input-bus chip) decomposes into `ShiftHudButton` (single chip, single subscription) used in pairs/trios by `ShiftHomeHudCluster`. The current array-based `HudButtons` ergonomics are not preserved — composition replaces the array prop, matching the React skill's "no boolean forest, no array forests" principle.
- R11. The story-local helpers `featureArtUrl()` and `formatRelative()` move with their nearest consumer (`ShiftHomeFeatureTile` and `ShiftHomeCaption` respectively). Neither becomes a shared utility.

**Page graduation and route wiring**

- R12. `ShiftHomePage` becomes the actual home page. `korri/products/app/routes/+index.tsx` is rewritten to a thin composition: import `ShiftHomePage`, render it. The current placeholder Tilegrid scroll demo at that route is removed.
- R13. Create the feature shape for the home surface per `AGENTS.md`: `korri/products/app/features/home/` with `brief.md` and `e2e/` (BDD `.feature` + `.steps.ts`). The brief captures what the home page promises behaviorally; the BDD covers at minimum the resume-target focus, caption tracking, and HUD presence. Generate the BDD wrappers via `just generate-bdd` and the feature map via `just generate-feature-map`.
- R14. The Shift CSS file is imported by the same two entry points the previous `shift.css` was imported by before commit `85ce4f5`: the portal entry (`korri/deploy/portal/main.tsx`) and the Storybook preview (`korri/deploy/storybook/preview.tsx`). The project-wide baseline `primitives/theme/styles.css` import remains separate and unchanged.

**Boundaries and import direction**

- R15. `primitives/` never imports from `themes/`. Themes may import from `primitives/`. This is a one-way dependency. (Lint enforcement is a planning concern; the rule itself is a requirement.)
- R16. `themes/shift/` never imports from `korri/products/app/`. Pages inside `themes/shift/pages/` are theme-owned; the route file in `products/app/` imports the page, not the other way around.
- R17. Generic infra (focus ring, cursor-none, foreground-muted token) never re-enters the Shift theme. Per the lesson of commit `85ce4f5`, those belong in `primitives/theme/styles.css` and apply project-wide.
- R18. Fixtures stay at `korri/shared/fixtures/games/`. Themes never own fixtures.

## Visual Aid — target file tree

```
korri/shared/
  primitives/                          (was design-system/)
    components/
      ui/Button.tsx
      Tilegrid/...                     (unchanged)
    lib/
      useContainerSize.ts
      useResolvedCSSLength.ts
      utils.ts
    theme/
      styles.css                       (project-wide baseline; unchanged content)

  themes/
    shift/
      shift.css                        (Shift tokens: @theme block + scoped CSS vars)
      atoms/
        ShiftPill.tsx
        ShiftTile.tsx
        ShiftHudGlyph.tsx
        ShiftAvatar.tsx
        ShiftStatusIcon.tsx
      molecules/
        ShiftSearchPill.tsx
        ShiftHudChip.tsx
        ShiftHudButton.tsx
        ShiftMenuButton.tsx
        ShiftStatusCluster.tsx
        ShiftHomeCaption.tsx
        ShiftHomeFeatureTile.tsx
        ShiftHomePosterTile.tsx
      organisms/
        ShiftHomeTopBar.tsx
        ShiftHomeRail.tsx
        ShiftHomeBottomBar.tsx
        ShiftHomeHudCluster.tsx
      templates/
        ShiftHomeRoot.tsx              (Provider; owns focusedId, captionX)
        ShiftHome.context.tsx
      pages/
        ShiftHomePage.tsx
        ShiftHomePage.stories.tsx

  fixtures/
    games/                             (unchanged)

korri/products/app/
  routes/
    +index.tsx                         (thin: imports ShiftHomePage)
  features/
    home/
      brief.md                         (new)
      e2e/
        home.feature                   (new)
        home.steps.ts                  (new)

korri/shared/design-system/explorations/home-screens/
    HomeHero.stories.tsx               (parked in place)
    HomeMosaic.stories.tsx             (parked in place)
    HomeSunlit.stories.tsx             (DELETED — graduated into themes/shift/)
    HudButtons.tsx                     (DELETED — replaced by ShiftHudButton)
    HudButtons.test.tsx                (DELETED — tests follow ShiftHudButton)
```

Note: the `explorations/` parent moves to `korri/shared/primitives/explorations/` as part of R1's rename.

## Success Criteria

- A new contributor reading `korri/shared/themes/shift/` can describe Shift's identity in one sentence without opening any file outside that folder.
- Iterating on a single piece (e.g., changing the focus halo color, swapping the search-pill expansion, retuning the HUD glyph) touches one file and at most one token.
- The home page renders identically (visually and behaviorally) before and after the decomposition. No regressions in focus tracking, caption x-snap, search-pill expansion, HUD activation states, or Mario-camera scroll behavior.
- `routes/+index.tsx` becomes a thin composition under ~10 lines.
- `themes/shift/` contains zero generic infra, zero fixtures, zero non-Shift concerns. The boundary that commit `85ce4f5` taught is preserved.
- `just check` passes (lint, typecheck, format, unit tests). `just check-bdd` and `just check-feature-map` pass for the new home feature.
- A Storybook story for `ShiftHomePage` renders the same surface as the current `HomeSunlit` story.

## Scope Boundaries

- **Out:** changes to Hero or Mosaic explorations. They park in place under `primitives/explorations/home-screens/` after R1's rename. No re-homing, no archive move, no deletion.
- **Out:** introducing a second theme alongside Shift. The token scoping question (`:root` vs `[data-theme="shift"]`) is decided as `:root` for now, with the understanding that scoping under a data-attribute is a cheap later move if a second theme arrives.
- **Out:** changes to the Tilegrid primitive, the games fixture, the resume domain model, or the input-bus contract. Shift consumes these unchanged.
- **Out:** a future library grid, drawer overlay, settings, search wiring, store, social, profile, install/update. Only the current Sunlit home surface (the visual identity that became Shift) graduates in this pass.
- **Out:** new visual-language decisions. The voice is settled. This brainstorm is structural, not creative.
- **Out:** any change to `primitives/theme/styles.css` content. The file moves with the rename; the rules inside do not change.
- **Out:** a generic theme-switching mechanism, theme registry, or `ThemeProvider` abstraction. Shift is the only theme; over-abstraction is the trap commit `85ce4f5` warned against.

## Key Decisions

- **`primitives/` over `headless/`, `foundation/`, `core/`, `base/`.** Matches the user's own framing ("more of a primitive that can be shared across themes"), aligns with the Radix vocabulary already present in this repo, and is honest about contents (Tilegrid has structural CSS, so "headless" would overpromise).
- **Theme contains the full atomic structure (atoms → pages), not just tokens.** The user's explicit framing: a theme is the visual identity in full. This intentionally widens the scope of "theme" beyond the industry-default tokens-only meaning. The drop-theme commit's lesson is preserved by excluding *non-identity* concerns (infra, fixtures), not by narrowing the theme to tokens.
- **Atomic-level folders inside the theme; React-skill flat shape inside a single stateful widget.** Both organizing principles coexist by operating at different scopes. The atomic-level folders win at the theme top level because the theme is many widgets; the React skill's flat shape applies inside any one of those widgets that needs internal structure.
- **No `tokens/` subfolder.** A single `shift.css` at the theme root is leaner and matches how `primitives/theme/styles.css` already works. Tailwind v4 `@theme` blocks are the project's idiom.
- **`ShiftHome*` prefix for the home surface from day one.** Avoids a rename when `ShiftLibrary*`, `ShiftSettings*`, etc. arrive.
- **`ShiftHomePage` lives inside the theme; the route file becomes a thin composition.** The page is part of Shift's identity; the route is a wiring detail.
- **Tokens scoped to `:root`, not `[data-theme="shift"]`, for now.** Single-theme app; cheap to add scoping later.
- **`HudButtons`'s array prop dies.** Replaced by single `ShiftHudButton` instances composed by `ShiftHomeHudCluster`. Matches the React skill's anti-array-forest stance.

## Dependencies / Assumptions

- Assumes the previous `shift.css` import sites (portal entry, Storybook preview) are the right re-import targets. Verified against commit `85ce4f5`'s diff (`korri/deploy/portal/main.tsx`, `korri/deploy/storybook/preview.tsx` both lost the import in that commit).
- Assumes `primitives/` rename is mechanically safe via a search-and-replace of `@shared/design-system` → `@shared/primitives` and a tsconfig path alias update. Path-alias breakage during the rename is a planning concern, not a requirement.
- Assumes `ShiftHomeRail` continues to consume `TilegridRailRoot` unchanged, including the recently added Mario-camera behavior (commits `e125dec`, `49def48`).
- Assumes the home feature's BDD is small (resume-target focus, caption tracking, HUD presence). Larger behavioral coverage is its own brainstorm.

## Outstanding Questions

### Resolve Before Planning

(None — all product/structure decisions are settled.)

### Deferred to Planning

- [Affects R1][Technical] How the rename `design-system/` → `primitives/` is sequenced against active worktrees and the `feat/tilegrid-mario-camera` branch. Likely a single mechanical commit at the top of this work.
- [Affects R5][Technical] Exact split between `@theme` block (Tailwind-utility-producing tokens) and plain scoped CSS variables in `shift.css`. Driven by which Shift tokens want utility-class access (`bg-shift-surface`, `text-shift-ink`) and which stay variable-only.
- [Affects R4, R8][Technical] Whether `ShiftPill`, `ShiftTile`, `ShiftHudGlyph` are real React components (`atoms/ShiftPill.tsx`) or pure CSS classes documented alongside `shift.css` (no `atoms/` folder of `.tsx` files; atoms are a class-vocabulary layer instead). The current Sunlit code uses CSS-class atoms (`.sunlit-pill`, `.sunlit-tile`, `.hud-glyph`), not React components. Both options preserve the atomic-decomposition principle (R4); the choice changes whether `themes/shift/atoms/` contains `.tsx` files or whether atoms are documented inline in `shift.css`. Planning decides.
- [Affects R9][Technical] Whether `ShiftHome.context.tsx` exposes raw setters (`setFocusedId`, `setCaptionX`) or higher-level mutations (`focusTile(id)`). The React skill prefers domain-level mutations; the current code uses raw setters wired to delegated DOM listeners.
- [Affects R13][Needs research] Exact BDD scenarios for the home page. Should reference acceptance criteria from `features/resume/brief.md` where they overlap (resume-target focus, "Continue" affordance behavior).
- [Affects R12][Technical] Whether the existing placeholder route's behavior (plain Tilegrid scroll over all games) needs preservation as a separate page (e.g., a future library route) or can be deleted outright. Recommendation: delete; library is its own surface.

## Next Steps

-> `/ce:plan` for structured implementation planning.
