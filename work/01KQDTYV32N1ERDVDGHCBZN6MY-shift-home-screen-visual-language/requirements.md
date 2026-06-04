---
date: 2026-04-30
topic: shift-home-screen-visual-language
---

# Shift Home Screen — Visual Language Exploration

## Problem Frame

The `shift` theme has a starter look (soft cards, sky-blue focus ring, gentle 200ms easing) but no committed visual language. The current home page (`korri/products/app/routes/+index.tsx`) just dumps every game into a `TilegridScrollRoot`, which neither argues for a design direction nor exercises the resume ritual that the `Safe Game Resume` feature already promises.

To find shift's visual language, build **two** distinct home-screen designs at opposite poles of an art-forward, low-chrome, calm axis. Pick the language by living with both, not by debating in the abstract.

- **Variant A — "Hero" (cinematic):** the home roars. One game's key art owns the screen.
- **Variant B — "Mosaic" (Rams/minimal):** the home whispers. The grid speaks, chrome disappears.

Same fixtures, same resume target, same Tilegrid primitive — only visual language differs. The two designs are deliberately not a compromise; they argue against each other so the gap between them tells us where shift should sit.

**Deliverable surface:** both variants are built as **Storybook stories** under the `shift` theme. The running app (`korri/products/app/**`) is not touched. Storybook's existing setup (`korri/deploy/storybook/preview.tsx`) already boots spatial navigation, loads `shift.css`, and exposes a light/dark toggle, so the stories run with the same input + theming substrate the real app uses.

## Requirements

**Shared (apply to both variants)**

- R1. Both variants render the same source content from `korri/shared/themes/shift/fixtures/games`. No variant gets unique fixtures, fake metadata, or curated subsets.
- R2. Both variants surface a single, clearly identifiable resume target — the same item in both — so the "previous game" promise from `features/resume/brief.md` is honored on entry.
- R3. Both variants are delivered as Storybook stories under the `shift` theme, switchable via the Storybook sidebar. No new product routes, no `korri/products/app/**` edits, no in-app toggle.
- R4. Both variants assume couch / TV / gamepad as the primary input. Focus is the only selection signal; no design element may rely on hover. Stories rely on Storybook's already-initialized spatial navigation (see `korri/deploy/storybook/preview.tsx`).
- R5. Neither variant auto-launches anything. Selection always requires explicit player input. (Inherits SGR-R2 from the resume brief.) In Storybook, "launch" is a no-op or a logged action; the requirement is about explicit activation, not about actually starting a game.
- R6. Both variants must be legible and stable at a 1920×1080 Storybook viewport viewed from ~10 feet, with one visible focused element at all times. A 1080p viewport preset should be the default for these stories.

**Variant A — Hero (cinematic)**

- R7. The resume target is rendered as a full-bleed hero occupying the dominant region of the screen (target ≥60% of the viewport area), using key art / screenshot for that game.
- R8. A single horizontal rail of tiles sits below the hero, showing recents and library entry points. The currently focused tile in the rail drives the hero (changing focus changes the hero with a soft crossfade).
- R9. The resume ritual is **explicit and cinematic**: the hero shows the game title, a "Continue" affordance, and a brief last-played caption (e.g. "Last played 2 days ago"). These are part of the visual language, not metadata badges bolted on.
- R10. Background treatment derives from the hero's art (e.g., extracted color or blurred extension), so the chrome feels like an extension of the game, not a frame around it.
- R11. Motion is part of the language: hero crossfade on focus change, slow ambient pan on the hero (~5–8s loop). Motion respects `prefers-reduced-motion`.
- R12. Chrome outside the hero + rail is minimal: no header bar, no clock, no section labels.

**Variant B — Mosaic (Rams / minimal)**

- R13. The screen is an edge-to-edge dense grid of square tiles on a single neutral surface (off-black or off-white — pick one and commit). No section dividers, no row labels.
- R14. Each tile shows **only cover art**. No overlaid titles, badges, playtime, "new" markers, or platform icons on the tile itself.
- R15. Hierarchy is expressed through **size, not chrome**. The resume target gets a span ≥ 2×2 (using the existing Tilegrid `span` mechanism); other notable items may get larger spans only if they earn it visually.
- R16. The resume ritual is **implicit**: there is no "Continue" button, no last-played caption, no resume label. The spanned tile is the resume. Focusing it and pressing confirm is the resume action.
- R17. Focused-tile metadata (game title, optionally one line of context) appears at a fixed location at the edge of the screen — like a museum placard — not on the tile.
- R18. Motion is near-absent: focus crossfade, no parallax, no ambient animation. Calm is the design.
- R19. Typography is small, restrained, and only present at the edges (placard region, optional tiny wordmark). The grid does not contain text.

## Success Criteria

- Both variants run on a real 1080p display with a gamepad, using actual fixtures, not mock screenshots.
- A side-by-side comparison (toggling between variants in dev) yields a clear preference or a clear synthesis decision — i.e., we can answer "which direction is shift?" after living with both for a session.
- The resume target is unmistakably the resume target in both variants, even though they argue for it differently.
- Neither variant requires fixture changes, schema changes, or new component primitives beyond the existing Tilegrid Roots.
- A new contributor opening either variant can describe its visual personality in one sentence without help.

## Scope Boundaries

- Out: a third hybrid/editorial variant. Already considered and dropped — the exercise is two poles, not a spectrum.
- Out: any change to `korri/products/app/**` — no new routes, no replacement of `+index.tsx`, no in-app variant toggle. The exploration lives entirely in Storybook.
- Out: settings, store, social, news, install/update, library filters, search, profile switching, or any non-home surface.
- Out: changes to the Tilegrid primitive, the resume domain model, or the games schema.
- Out: per-platform / per-source visual treatments (every game uses the same tile rules in each variant).
- Out: animation choreography beyond what's listed (no transition between variants; no full-screen launch animation; no "bootup" sequence).
- Out: accessibility work beyond the focus + reduced-motion requirements already listed; full a11y pass is its own concern.

## Key Decisions

- **Two variants, not three.** Dropped the hybrid "Editorial" direction. Two poles are more useful than three points on a line because they make the trade-off visible.
- **Variant-appropriate resume treatment.** A makes resume cinematic and explicit; B keeps it implicit and spatial. The disagreement is intentional — it's part of what each visual language is *arguing*.
- **Same content in both.** Different fixtures would let each variant cheat. Forcing identical content forces honest comparison.
- **Storybook-only, not in-app.** Both variants live as stories. Storybook already boots spatial navigation, loads `shift.css`, and provides a light/dark toggle — same substrate as the real app, without touching product routes.
- **No third "shipped" variant emerges from this brainstorm.** A follow-up brainstorm picks the direction (or a synthesis) after the comparison; this brainstorm is explicitly about exploration, not commitment.

## Dependencies / Assumptions

- Assumes `korri/shared/themes/shift/fixtures/games` carries enough cover art / screenshots that Variant A's hero treatment doesn't fall apart on most entries. (Unverified — should be checked during planning.)
- Assumes the existing Tilegrid Roots (`TilegridScrollRoot`, `TilegridRailRoot`) cover both variants without needing a new Root.
- Assumes Storybook's already-initialized spatial navigation (`preview.tsx`) can move focus between the rail and the hero region in Variant A without bespoke key handling.
- Assumes the existing `shift` theme tokens (`shift.css`, `shift-tokens.ts`) can be extended for two visual languages without forking the theme.
- Assumes the resume target can be expressed in fixtures or a story-local convention (e.g., "first item in the list is the resume target") without changing the games schema.

## Outstanding Questions

### Resolve Before Planning

- *(none — product decisions are settled)*

### Deferred to Planning

- [Affects R7, R10][Needs research] Does the current fixture set include usable hero-grade art (key art / 16:9 screenshots) for the resume target and most rail items, or does Variant A need a fallback treatment for art-poor entries?
- [Affects R8][Technical] How should rail focus drive the hero — derived from spatial-nav focus events, a Tilegrid context extension, or local state in a wrapper around `TilegridRailRoot`?
- [Affects R3][Technical] Where should the stories live and how should they be titled? Candidates: `korri/shared/themes/shift/organisms/Home*.stories.tsx`, or alongside Tilegrid as composition examples. Pick a placement that reads naturally in the Storybook sidebar when comparing the two.
- [Affects R6][Technical] What Storybook viewport preset(s) should the home stories default to (1920×1080 baseline; possibly a 1280×720 secondary)?
- [Affects R10][Needs research] Color extraction from cover art — is there an existing utility in shift, or does this need a small helper? Performance budget: hero background derivation must not stutter focus transitions in the rail.
- [Affects R13, R17][Technical] How should the focused-tile placard in Variant B receive the focused item — Tilegrid context exposure, or a separate focus subscription via `useInputAction`?
- [Affects R15][Technical] Is the resume target marked in fixtures today, or does this require a story-local convention (e.g., first item is the resume target)?

## Next Steps

-> `/ce:plan` for structured implementation planning.

---

# Addendum — Variant C: Sunlit (Friendly), added 2026-05-01

## Why a Third Variant

Hero and Mosaic argue against each other along a cinematic↔minimal axis. Living with both surfaced a real gap: neither pole captures **friendly, low-contrast, family-arcade DNA** — bright surfaces, soft rounding, a signature focus halo, and gamepad chrome rendered as visible visual furniture rather than as discreet edge labels. That language exists in the wild as the Nintendo Switch 2 home cluster, refined over multiple console generations.

**Sunlit is not a synthesized third pole.** It is a **clone** of the Switch 2 home cluster, used as a calibration anchor — a known-good visual language sitting between Hero and Mosaic, imported wholesale rather than designed. The original "two poles, not three" decision still holds for *synthesized* variants; Sunlit is a different category (cloned reference) and is justified by the gap Hero/Mosaic revealed once they were both running.

Deliverable shape mirrors Hero/Mosaic: a Storybook story under `korri/shared/design-system/explorations/home-screens/`, decoupled from `shift`, reusing only the Tilegrid primitive, fixtures, and `GameRecord` shape.

## Phasing

The Switch 2 home cluster spans three surfaces (home rail / library grid / side drawer). Sunlit is delivered in three independently-shippable phases:

| Phase | Scope | New mechanisms | Story |
|---|---|---|---|
| **1 — Home rail** | Switch screens 1+2 | Status chrome, search pill, lavender focus halo, mixed landscape-feature + vertical-poster tiles, eyebrow+caption below rail, Menu pill, HUD with `Ⓧ Close Software` chip | `HomeSunlit.stories.tsx` → story `Sunlit (Friendly)` |
| **2 — Library grid** | Switch screen 4 | Tab strip with `L`/`R` shoulder hints, dense uniform 2:3 vertical-poster grid, install/play badge on tile | Same file → story `Library` |
| **3 — Drawer overlay** | Switch screen 3 | Side drawer overlay (focus trap, dim background, colored icon list); wired to the Menu pill from Phase 1 | Same file → story `Home with Drawer` |

Each phase merges independently. Phase 1 establishes all design tokens; Phases 2–3 inherit them.

## Variant C — Sunlit (Friendly): Phase 1 Requirements

- R20. Phase 1 is delivered as a single Storybook story (`Sunlit (Friendly)` in `HomeSunlit.stories.tsx`) that reproduces the Switch 2 home cluster's resume moment: a single horizontal rail with focus initially on the resume target.
- R21. The rail is a heterogeneous single-row composition rendered via `TilegridRailRoot` using its now-shipped rectangular `cellSize: { width, height }` + per-item `span` (column-only). The resume target occupies a wide landscape "feature" cell (≈3.5× the column width of a poster); other items are vertical 2:3 cover posters. All cells share the same row height and scroll together.
- R22. The resume target is the first fixture (`crystalline-drift`), inheriting the same convention as Hero and Mosaic. Initial focus on mount is the resume target.
- R23. Below the rail, a caption region renders metadata about the focused item:
  - When focus is the resume target: a green "LAST PLAYED" eyebrow + the game's display name. Matches Switch screen 1.
  - When focus is any other tile: the game's display name only, no eyebrow. Matches Switch screen 2.
- R24. The focus indicator is a soft **lavender halo** around the focused tile (faithful Switch trademark). The halo color is bound to a `--focus-glow` CSS token at the story root so it can be rebound to a Korri brand color later without changing component code.
- R25. Top-left search bar: pill-shaped, decorative-only in Phase 1 (no search wiring). Focusable via spatial nav so the nav graph reflects the real surface; pressing confirm is a no-op (Phase 2 may wire it).
- R26. Top-right status chrome: faithful five-element decorative cluster — brightness icon · time (static `"16:24"`) · wifi icon · battery icon · neutral avatar circle. Non-focusable, `aria-hidden`. Avatar is a neutral-toned filled circle (no Kirby, no branded mark).
- R27. Bottom-left Menu pill (`≡ Menu`): focusable via spatial nav in Phase 1; pressing confirm is a no-op. Phase 3 wires it to open the drawer. The pill's visual presence in Phase 1 is required for the spatial-nav graph to match the final surface.
- R28. Bottom-right HUD region in Phase 1 home renders **two semantic-action chips** via the shared `HudButtons` component (`+ Options`, `A Continue`) plus one **story-local static** chip (`Ⓧ Close Software`) interleaved per the source order (`+ Options · Ⓧ Close Software · A Continue`, left-to-right). The `B Back` chip is intentionally omitted — Switch's home does not surface a back affordance from the home itself. The static `Ⓧ` chip is non-focusable, has no input-bus subscription, and is decorative only. (Phase 2's library will show a different HUD set: `+ Options · A Continue · B Back`.)
- R29. The shared `HudButtons` component is extended along two axes, both backward-compatible:
  - **Glyph characters** — three optional props (`confirmGlyph` / `backGlyph` / `optionsGlyph`) defaulting to `A` / `B` / `Y` so Hero and Mosaic stay byte-identical. Sunlit passes `A` / `B` / `+`.
  - **Action selection** — an optional prop that controls which of the three semantic-action chips render, defaulting to all three (current behavior preserved). Sunlit Phase 1 omits `back`; Phase 2 includes all three. Exact prop shape (`actions: ("confirm"|"back"|"options")[]` vs. three booleans) is a planning decision; the requirement is that suppression is supported without forking `HudButtons`.
  - The pulse-on-press behavior, input-bus wiring, semantic-action coverage, and accessibility characteristics remain shared. Glyph order in the rendered output should follow source convention for each variant (Sunlit places `A` on the right, matching Switch and our existing convention).
- R30. Cover art handling, story-local with no schema or fixture change:
  - **Feature tile (resume target only):** request a 1280×720 landscape image from picsum using a `-wide` seed suffix (e.g. `https://picsum.photos/seed/shift-${id}-wide/1280/720`). This restores the cinematic landscape character that the Switch source's hero tile depends on; cropping the existing 600×600 fixture to 16:9 would defeat that character.
  - **Posters:** use the fixture's existing media URL with `object-fit: cover` to fill the 2:3 cell.
- R31. Light theme is the primary visual; a dark mode counterpart is required and switches via Storybook's existing `:root.dark` toggle. The light surface is a warm cream-grey (Switch reference); dark mode is a deep blue-black (Switch night mode reference).
- R32. Sunlit reuses the project's fluid theme tokens (`--text-*`, `--spacing`) shipped in the design-system theme. The story root declares `container-type: inline-size` so type and spacing scale with the home surface, not the viewport — same pattern as Hero and Mosaic.

## Phase 1 Success Criteria

- A first-time viewer who has used a Switch 2 immediately recognizes the visual language as a clone of that surface.
- The exploration runs side-by-side with Hero and Mosaic in Storybook (`Explorations / Home Screens / *`); switching between them is a single sidebar click.
- The lavender focus halo, the eyebrow+caption transition, and the heterogeneous rail (landscape feature + vertical posters in one row) all behave correctly with gamepad/keyboard spatial navigation at 1920×1080.
- The story is legible and stable from handheld (420×720) to TV (1920×1080); type and spacing visibly breathe with container size, not zoom.
- No edits to `korri/products/app/**`. No edits to fixtures or `GameRecord`. The only shared-component change is the three optional glyph props on `HudButtons`.

## Phase 1 Scope Boundaries

- Out: Phase 2 (library grid) and Phase 3 (drawer) — separate phases.
- Out: any rebrand of Switch IP. Avatar is a neutral circle; no Kirby, no Mario Kart art (the cinematic landscape comes from picsum, not from a real game).
- Out: real wiring of the search bar, the menu pill, or the `Ⓧ Close Software` chip. All decorative or no-op in Phase 1.
- Out: any change to the Tilegrid primitive. Phase 1 consumes the rectangular-cell + per-item-colSpan capability that already shipped (commits `5cec1a8` → `042e432`).
- Out: extracting any Sunlit-specific token into the global design-system theme. Tokens stay scoped to `[data-exploration="sunlit"]`, like Hero and Mosaic.
- Out: animation choreography beyond focus crossfade and HUD glyph pulse-on-press.
- Out: a third kind of HUD chip API (the static `Ⓧ Close Software` chip is rendered inline in the story, not added to `HudButtons`).

## Phase 1 Key Decisions

- **Tilegrid grew, didn't fork.** The rectangular `cellSize` + per-item column-only `span` shipped on `TilegridRailRoot` so the heterogeneous rail is faithful to the source without a parallel primitive. Sibling explorations (Hero/Mosaic) and existing consumers are unaffected (square `cellSize` continues to work).
- **`HudButtons` extended with glyph props, not forked.** Three optional character props let Sunlit render Switch glyphs (`A`/`B`/`+`) without breaking Hero/Mosaic's `A`/`B`/`Y`. The fourth Switch chip (`Ⓧ Close Software`) is rendered as a story-local static element rather than expanding `HudButtons` into a generic chip array.
- **Faithful clone, token-bound for later swap.** The lavender focus halo and the cream-grey surface are the Switch trademarks; both live behind CSS tokens at the story root so a future Korri brand pass can rebind without touching JSX.
- **Story-local landscape helper for the feature tile.** A 1280×720 picsum URL with a `-wide` seed restores the cinematic character of the feature tile without changing fixtures or `GameRecord`. Same `id`, different aspect — a faithful Sunlit-only adaptation.
- **Phased delivery, single file.** Three phases ship as three stories in one file (`HomeSunlit.stories.tsx`), so they share tokens and the variant root selector. Phase 1 is independently mergeable and reviewable.
- **Menu pill is focusable from day 1.** Even though the drawer doesn't exist until Phase 3, the spatial-nav graph in Phase 1 already matches the final surface, so Phase 3 only changes the action, not the layout.

## Phase 1 Dependencies / Assumptions

- `TilegridRailRoot` accepts `cellSize: { width, height }` and per-item column-only `span`. **Verified shipped** in commits `5cec1a8`, `c614606`, `740227b`, `042e432` (see `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.tsx`).
- Picsum reachable from Storybook's runtime for landscape art at `picsum.photos/seed/<seed>/1280/720`. **Verified** as the existing fixture image source (`korri/shared/themes/shift/fixtures/games.ts`).
- The fluid theme scale (`--text-*`, `--spacing`) and `container-type: inline-size` pattern are already shipped in `korri/shared/design-system/theme/styles.css` and used by Hero/Mosaic. **Verified** in the prior brainstorm cycle.
- `useInputAction` semantic actions cover `confirm`, `back`, `options`. **Verified** in `korri/shared/input/types.ts`.
- `HudButtons` is a story-local file that all three explorations import; modifying it is in-scope for Sunlit work.
- Storybook's `:root.dark` toggle and 1080p viewport preset already work for Hero/Mosaic and require no changes for Sunlit.

## Phase 1 Outstanding Questions

### Resolve Before Planning

- *(none — Phase 1 product decisions are settled)*

### Deferred to Planning or to Later Phases

- [Affects R28][Phase 2] How are static-HUD-chip patterns (like Sunlit's `Ⓧ Close Software`) factored when Phase 2's library shows a different HUD set (`+ Options · A Continue · B Back`)? Decide when Phase 2 is in flight — may be as simple as a story-local `<StaticHudChip>` helper used inline in each story.
- [Affects R29][Technical] Choose the exact shape of `HudButtons`'s action-selection extension: `actions: ("confirm"|"back"|"options")[]` (most flexible, controls order too) vs. three boolean show props (`showConfirm` / `showBack` / `showOptions`, simplest). Both are backward-compatible; pick during planning.
- [Affects R23][Technical] How does the caption region receive the focused item — same pattern as Mosaic's placard (`focusin` listener on the rail container reading `data-tile-id`), or via Tilegrid context exposure? Mosaic's pattern is the safe default; revisit only if there's a reason.
- [Affects R24, R31][Visual] Exact lavender-halo color values (light + dark mode), avatar circle color values, status-chrome icon stroke weights, and search-pill border-radius — calibrate against the source screenshots during implementation; not worth pinning here.
- [Affects R29][Cross-cutting] If a future variant needs a fourth glyph slot or a different glyph set per controller (Xbox `Y` vs PlayStation triangle vs Switch `+`), is the right shape a per-variant prop set on `HudButtons` or a controller-glyph context provider? Not blocking Sunlit; relevant when more controllers enter the picture.
- [Affects R26][Visual] Does the avatar circle need any internal motif (a single dot, a soft gradient) to read as an avatar rather than a blank fill? Try plain first; iterate if it reads as an empty circle.
- [Phase 2] The library tab strip lists categories (`ALL GAMES`, `INSTALLED`, `ACTION`, `RPG`, `SOULS`, `FIRST PERSON SHOOTER`, `RACING`). Source these from existing fixtures' genre tags or hardcode story-local? Decide in Phase 2.
- [Phase 3] Drawer item list (`My Library / Online / Chat / News / Shop online / Multimedia / Share / Controller / Brightness / Card / On-Off`). Faithful clone or Korri-adapted vocabulary? Decide in Phase 3.

