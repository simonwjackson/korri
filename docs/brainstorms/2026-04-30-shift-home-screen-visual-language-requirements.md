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
