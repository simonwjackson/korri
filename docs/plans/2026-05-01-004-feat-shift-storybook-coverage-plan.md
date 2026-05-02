---
title: "feat: Add Storybook coverage at every Shift atomic level"
type: feat
status: active
date: 2026-05-01
---

# feat: Add Storybook coverage at every Shift atomic level

## Overview

The Shift atomic theme just shipped (`docs/plans/2026-05-01-003-feat-shift-atomic-theme-plan.md`), but its plan only specified one Storybook story — at the page level. Atoms, molecules, organisms, and the template Root have no isolated review surfaces. This plan adds story coverage at every level so each piece of Shift can be inspected, controlled, and visually regression-checked on its own.

The deliberate framing: stories where they earn their keep. Pure forwarding atoms (Avatar, HudGlyph, StatusIcon — all single-line wrappers) get no story file; their behavior is fully exercised by the molecules that compose them. Atoms with non-trivial visual state (focus rings, container-relative sizing) and every molecule, organism, and the template do get stories. Net add: 15 story files.

## Problem Frame

The previous plan's `Output Structure` listed `pages/ShiftHomePage.stories.tsx` as the only `.stories.tsx`. That was an oversight at planning time — the conventional atomic-design + Storybook pattern (see the dropped `2026-04-29-001-feat-shift-theme-atomic-design-plan.md`) puts a story alongside every component so each level is reviewable independently. Without per-level stories:

- Visual regressions in single atoms (e.g., `ShiftTile` focus ring after the `inset-outline` Chromium learning) only surface during page-level review.
- Iterating on one piece (e.g., the search pill expansion easing) requires loading the full home page.
- Designers and contributors lack a sidebar map of what Shift is composed of.

This plan does not change runtime behavior. It adds review surfaces.

## Requirements Trace

- R1. Each Shift atom with non-trivial visual state has a story.
- R2. Every Shift molecule has a story.
- R3. Every Shift organism has a story.
- R4. The Shift home template (Root) has a skeleton story showing the layout shell.
- R5. Stories with combinatorial axes use Storybook controls instead of multiplying near-duplicate stories, per `docs/solutions/best-practices/control-driven-storybook-coverage-for-combinatorial-components-2026-05-01.md`.
- R6. Context-dependent components (`ShiftHomeCaption`, `ShiftHomeRail`) render inside an inline `ShiftHomeRoot` wrapper backed by the existing games fixture. No mock Provider, no story-helper file.
- R7. Story titles follow `Themes/Shift/<Atomic Level>/<Component>` so the Storybook sidebar mirrors the atomic hierarchy.
- R8. No runtime changes. Atoms, molecules, organisms, the template, the page, and the route render identically before and after this plan.

## Scope Boundaries

- **Out:** stories for `ShiftAvatar`, `ShiftHudGlyph`, and `ShiftStatusIcon`. These are pure forwarding wrappers (`<img>`, `<span>`, Lucide adapter); their behavior is fully covered by the molecules that compose them. A change that breaks them visibly breaks the molecule story too.
- **Out:** any change to component implementations. If a story reveals a bug, fix it in a follow-up commit; this plan adds review surfaces, not behavior changes.
- **Out:** stories for Hero or Mosaic explorations under `korri/shared/primitives/explorations/home-screens/`. Those parked explorations still run as their existing single-story files.
- **Out:** Playwright component tests, axe scans, screenshot diffs. This plan adds Storybook stories only; testing infrastructure that builds on the stories is its own follow-up.
- **Out:** changes to `korri/deploy/storybook/preview.tsx`. The current setup already loads `shift.css`, exposes the light/dark toolbar, and boots spatial navigation — sufficient for every story added here.
- **Out:** introducing a story-helper module. Each story file is self-contained; context wrappers are inlined where needed.

## Context & Research

### Relevant Code and Patterns

- `korri/shared/primitives/components/Tilegrid/Tilegrid.stories.tsx` — canonical control-driven story pattern in this repo. Uses one `StoryArgs` interface with multiple union axes and one `Playground` story instead of N near-duplicate stories. Per-story `argTypes.<key>.control: false` hides irrelevant controls. Mirror this shape for `ShiftHudButton`'s control story.
- `korri/shared/themes/shift/pages/ShiftHomePage.stories.tsx` — the existing Shift story; viewport presets (1080p / 720p / Tablet / Handheld) are reusable for organisms and the template story.
- `korri/deploy/storybook/preview.tsx` — already loads `@shared/themes/shift/shift.css` and `@fontsource-variable/nunito`, exposes a light/dark color-mode toolbar, and boots spatial navigation. Stories need no additional setup.
- `korri/shared/themes/shift/templates/ShiftHomeRoot.tsx` — used directly as a story wrapper for `ShiftHomeCaption` and `ShiftHomeRail`. Accepts an `items` array and an optional `resumeTarget`.
- `korri/shared/fixtures/games/games.ts` — the canonical games fixture; same source the page story uses.

### Institutional Learnings

- `docs/solutions/best-practices/control-driven-storybook-coverage-for-combinatorial-components-2026-05-01.md` — collapse cartesian-product stories into one Storybook story with controls. Applies to `ShiftHudButton` (action × glyph × label) primarily; other Shift components have one obvious shape and don't multiply.
- `docs/solutions/ui-bugs/inset-outline-clipped-by-overflow-hidden-2026-05-01.md` — visual verification of the `ShiftTile` focus ring is the only way to catch this class of bug. The `ShiftTile` story is the regression surface.
- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — Storybook preview already initializes spatial navigation globally; stories should not call `startSpatialNavigation()` themselves.

### External References

External research skipped. The patterns are local: Storybook 9 (`@storybook/react-vite`), the Tilegrid control-driven precedent, and the existing `ShiftHomePage.stories.tsx` viewport shape.

## Key Technical Decisions

- **Story scope by "earns its keep" rather than "one per file."** Pure forwarding atoms (`ShiftAvatar`, `ShiftHudGlyph`, `ShiftStatusIcon`) have no behavior beyond passing props to a primitive element; a story would be a tautology. Atoms with focus / sizing behavior (`ShiftTile`, `ShiftPill`) and every molecule / organism / template do get stories.
- **Context wrappers are inlined, not extracted into a helper.** The two context-dependent stories (`ShiftHomeCaption`, `ShiftHomeRail`) wrap their component in a small literal `<ShiftHomeRoot items={…}>` block. A shared helper would force every future Shift story author to learn an indirection for ~6 lines of inline code. Mirrors how `Tilegrid.stories.tsx` keeps wrappers inline.
- **One control-driven story for `ShiftHudButton`, single stories elsewhere.** The hud button has three independent axes (action / glyph / label) that produce visibly different chips. Other Shift components have one obvious shape — multiple stories would be near-duplicates that the control-driven learning warns against.
- **Per-level title hierarchy.** `Themes/Shift/Atoms/<Name>`, `Themes/Shift/Molecules/<Name>`, etc. The Shift sidebar tree visually matches the file hierarchy and the atomic taxonomy.
- **Reuse `ShiftHomePage.stories.tsx`'s viewport presets.** The same four presets (1080p / 720p / Tablet / Handheld) apply at organism and template levels because Shift is a TV-first surface and components scale via container queries. Atom and molecule stories default to the desktop preset and let the viewport addon do the rest.
- **No new tests.** Stories are visual review surfaces, not behavior tests. Component-level behavior is already covered by `ShiftHudButton.test.tsx` and the BDD scenarios on the home route.

## Open Questions

### Resolved During Planning

- **Which atoms skip stories?** `ShiftAvatar`, `ShiftHudGlyph`, `ShiftStatusIcon` — they are single-line forwarding wrappers fully exercised by molecule stories.
- **Where do stories with context dependencies wrap their component?** Inline `<ShiftHomeRoot>` block in the same story file. No story-helper module.
- **Should `ShiftHudButton` have separate `Confirm`/`Back`/`Options` stories or one Playground with controls?** One Playground with `action`, `glyph`, `label` controls, per the control-driven learning.
- **Should `ShiftTile` have a synthetic "focused" story alongside the default?** No. The `:focus-visible` state is browser-driven; reviewers Tab into the tile in the live story. Stories should not paint manufactured states the runtime never produces.
- **Where does the template story render?** `ShiftHomeRoot` is the template; its story renders the Root with three placeholder `<div>` children that read as "TopBar slot", "Middle slot", "BottomBar slot" so the layout shell is visible without pulling in real organisms (which already have their own stories).

### Deferred to Implementation

- **Exact placeholder copy and tones** for the `ShiftHomeRoot` template skeleton story. Pick during implementation; aim for legible-from-10-feet text in the surface ink color.
- **`argTypes` shape for `ShiftHudButton`'s Playground story** — `action` is a select union, `glyph` and `label` are free-form strings. Final shape (whether `glyph` is text input or a small set of presets) lands during implementation.
- **Whether `ShiftHomeRail` story uses the full games fixture or a smaller deterministic subset** for faster Storybook hot-reload. Default to the full fixture for parity with the page story; trim only if hot-reload feels sluggish during review.

## Output Structure

    korri/shared/themes/shift/
      atoms/
        ShiftPill.stories.tsx                 (new)
        ShiftTile.stories.tsx                 (new)
      molecules/
        ShiftHomeCaption.stories.tsx          (new — context-dependent)
        ShiftHomeFeatureTile.stories.tsx      (new)
        ShiftHomePosterTile.stories.tsx       (new)
        ShiftHudButton.stories.tsx            (new — control-driven)
        ShiftHudChip.stories.tsx              (new)
        ShiftMenuButton.stories.tsx           (new)
        ShiftSearchPill.stories.tsx           (new)
        ShiftStatusCluster.stories.tsx        (new)
      organisms/
        ShiftHomeBottomBar.stories.tsx        (new)
        ShiftHomeHudCluster.stories.tsx       (new)
        ShiftHomeRail.stories.tsx             (new — context-dependent)
        ShiftHomeTopBar.stories.tsx           (new)
      templates/
        ShiftHomeRoot.stories.tsx             (new — layout skeleton)

## Implementation Units

- [ ] **Unit 1: Atom stories**

**Goal:** Add Storybook coverage for the two atoms whose visual identity goes beyond pure forwarding: `ShiftPill` (pill base, focus halo) and `ShiftTile` (rounded sunken tile, ::after focus ring). Skip `ShiftAvatar`, `ShiftHudGlyph`, `ShiftStatusIcon` — pure wrappers covered by molecule stories.

**Requirements:** R1, R7.

**Dependencies:** None.

**Files:**
- Create: `korri/shared/themes/shift/atoms/ShiftPill.stories.tsx`
- Create: `korri/shared/themes/shift/atoms/ShiftTile.stories.tsx`

**Approach:**
- Each story renders the atom inside a `<div data-shift-home>` host so `shift.css` rules apply (without that attribute, the class hooks are no-ops). The host can be a small inline decorator or a wrapper element in the render function.
- `ShiftPill` story: renders a single pill with a placeholder label so reviewers can Tab into it and see the focus halo. Default desktop viewport.
- `ShiftTile` story: renders a single tile with a placeholder image inside (consistent with the rail's actual feature tile) so the focus ring's interaction with `overflow: hidden` is visible. Default desktop viewport.
- Story titles: `Themes/Shift/Atoms/Pill`, `Themes/Shift/Atoms/Tile`.

**Patterns to follow:**
- `korri/shared/themes/shift/pages/ShiftHomePage.stories.tsx` for `Meta`/`StoryObj` shape and `parameters.layout: "fullscreen"` (atoms can use `"centered"` instead since they don't fill the surface).
- `[data-shift-home]` host attribute pattern from `ShiftHomeRoot.tsx`.

**Test scenarios:**
- Test expectation: none — stories are visual review surfaces, not behavior tests.

**Verification:**
- Storybook sidebar shows `Themes/Shift/Atoms/Pill` and `Themes/Shift/Atoms/Tile`.
- Tabbing into the pill shows the lavender halo; Tabbing into the tile shows the ::after focus ring on all four edges (the inset-outline learning).
- Light/dark toolbar toggle re-skins each atom correctly.

- [ ] **Unit 2: Molecule stories**

**Goal:** Add Storybook coverage for every Shift molecule. Use one control-driven Playground for `ShiftHudButton`; single stories for the rest. The home-context-dependent `ShiftHomeCaption` wraps its component in an inline `ShiftHomeRoot`.

**Requirements:** R2, R5, R6, R7.

**Dependencies:** None.

**Files:**
- Create: `korri/shared/themes/shift/molecules/ShiftHomeCaption.stories.tsx`
- Create: `korri/shared/themes/shift/molecules/ShiftHomeFeatureTile.stories.tsx`
- Create: `korri/shared/themes/shift/molecules/ShiftHomePosterTile.stories.tsx`
- Create: `korri/shared/themes/shift/molecules/ShiftHudButton.stories.tsx`
- Create: `korri/shared/themes/shift/molecules/ShiftHudChip.stories.tsx`
- Create: `korri/shared/themes/shift/molecules/ShiftMenuButton.stories.tsx`
- Create: `korri/shared/themes/shift/molecules/ShiftSearchPill.stories.tsx`
- Create: `korri/shared/themes/shift/molecules/ShiftStatusCluster.stories.tsx`

**Approach:**
- All stories wrap their component in a `[data-shift-home]` host so `shift.css` rules apply.
- `ShiftHudButton.stories.tsx` follows the control-driven pattern: one `Playground` story with `argTypes` exposing `action` (select: confirm / back / options), `glyph` (text), and `label` (text). Reviewers can dispatch the matching action via Storybook's actions panel or a small inline button to see the pulse.
- `ShiftHomeCaption.stories.tsx` wraps the caption in `<ShiftHomeRoot items={fixtureSubset}>{ <ShiftHomeCaption /> }</ShiftHomeRoot>` and renders both states (resume-focused, non-resume-focused) by toggling which item is initially focused. Two stories: `ResumeFocused`, `NonResumeFocused`.
- `ShiftSearchPill.stories.tsx` renders the pill with the default placeholder. Reviewers Tab into it to see the rest → expanded state transition.
- `ShiftStatusCluster.stories.tsx` exposes `time` and `avatarSrc` controls so reviewers can verify spacing at different time-string lengths and avatar resolutions.
- Other molecules use single default stories with sensible placeholder text.
- Story titles: `Themes/Shift/Molecules/<Name>` per file.

**Patterns to follow:**
- `korri/shared/primitives/components/Tilegrid/Tilegrid.stories.tsx` for the control-driven `Playground` shape (`StoryArgs` interface + `argTypes`).
- `korri/shared/themes/shift/pages/ShiftHomePage.stories.tsx` for `Meta`/`StoryObj` defaults.
- The actual rendering inside `korri/shared/themes/shift/organisms/ShiftHomeTopBar.tsx` and `ShiftHomeBottomBar.tsx` for realistic prop values (time, avatar src).
- `korri/shared/themes/shift/templates/ShiftHomeRoot.tsx` for inline-wrapping `ShiftHomeCaption`.

**Test scenarios:**
- Test expectation: none — stories are visual review surfaces, not behavior tests.

**Verification:**
- Storybook sidebar shows all 8 molecules under `Themes/Shift/Molecules/`.
- `ShiftHudButton` Playground responds to `action`, `glyph`, `label` control changes; pressing the matching keyboard / gamepad action pulses the chip.
- `ShiftSearchPill` collapses → expands when focused.
- `ShiftHomeCaption` `ResumeFocused` story shows a relative-time label; `NonResumeFocused` does not.
- Light/dark toggle re-skins each molecule.

- [ ] **Unit 3: Organism and template stories**

**Goal:** Add Storybook coverage for every organism plus the template Root (as a layout skeleton). The two context-dependent stories (`ShiftHomeRail`, the template skeleton) wrap their component in an inline `ShiftHomeRoot` backed by the games fixture.

**Requirements:** R3, R4, R6, R7.

**Dependencies:** None.

**Files:**
- Create: `korri/shared/themes/shift/organisms/ShiftHomeBottomBar.stories.tsx`
- Create: `korri/shared/themes/shift/organisms/ShiftHomeHudCluster.stories.tsx`
- Create: `korri/shared/themes/shift/organisms/ShiftHomeRail.stories.tsx`
- Create: `korri/shared/themes/shift/organisms/ShiftHomeTopBar.stories.tsx`
- Create: `korri/shared/themes/shift/templates/ShiftHomeRoot.stories.tsx`

**Approach:**
- Each story uses the four-viewport preset block from `ShiftHomePage.stories.tsx` (1080p / 720p / Tablet / Handheld) so reviewers see the organism scale across the same range as the page.
- `ShiftHomeTopBar.stories.tsx` renders the bar with placeholder time and avatar values, optionally exposing them as controls.
- `ShiftHomeBottomBar.stories.tsx` and `ShiftHomeHudCluster.stories.tsx` need no context; they render directly inside a `[data-shift-home]` host.
- `ShiftHomeRail.stories.tsx` wraps the rail in `<ShiftHomeRoot items={games}>{ <ShiftHomeRail /> }</ShiftHomeRoot>` so the rail receives `items`, `resumeTarget`, `railRef`, and `focusTile` from real context. Initial focus on the resume tile demonstrates the rail's mount behavior the same way the page does.
- `ShiftHomeRoot.stories.tsx` renders the Root with three placeholder `<section>` children (`TopBar slot`, `Middle slot`, `BottomBar slot`) styled with the surface ink color so the layout shell is visible without pulling in real organisms. Demonstrates the three-region flex column without coupling to the home composition.
- Story titles: `Themes/Shift/Organisms/<Name>`, `Themes/Shift/Templates/Home Skeleton`.

**Patterns to follow:**
- `korri/shared/themes/shift/pages/ShiftHomePage.stories.tsx` for the viewport block.
- `korri/shared/fixtures/games/games.ts` for the rail story's items.
- `korri/shared/themes/shift/templates/ShiftHomeRoot.tsx` for understanding the three-region layout that the template skeleton story should communicate.

**Test scenarios:**
- Test expectation: none — stories are visual review surfaces, not behavior tests.

**Verification:**
- Storybook sidebar shows all 4 organisms under `Themes/Shift/Organisms/` and the template under `Themes/Shift/Templates/`.
- `ShiftHomeRail` story renders the rail with the resume tile spanning two columns and initial focus on it; arrow-key navigation moves focus across tiles.
- `ShiftHomeHudCluster` chips pulse on input-bus emit (gamepad / keyboard `Enter` / `+` etc.), matching the page-level behavior.
- `ShiftHomeRoot` skeleton renders the three-region layout at 1080p with all three slots visible at the surface ink tone.
- Light/dark toggle re-skins each organism and the template.

## System-Wide Impact

- **Interaction graph:** Stories run in the existing Storybook iframe substrate. Spatial navigation is initialized once globally by `preview.tsx`, so focus-sensitive stories (`ShiftPill`, `ShiftTile`, `ShiftHomeRail`) work without per-story setup.
- **Error propagation:** None new. Stories that depend on `useShiftHome()` fail loudly outside a `ShiftHomeRoot` per the existing context guard, which surfaces immediately if a story forgets the wrapper.
- **State lifecycle risks:** Storybook hot-reload on `ShiftHomeRail.stories.tsx` re-mounts `ShiftHomeRoot` with the same `railRef` lifecycle as the page, exercising the focus / scroll / resize cleanup paths.
- **API surface parity:** No exported API changes. Story files import existing public components.
- **Integration coverage:** The `ShiftHomeRail` and `ShiftHomeCaption` stories exercise the context contract end-to-end (real Provider, real consumers) the same way the page does. `ShiftHomeRoot` story exercises the layout shell with stub content.
- **Unchanged invariants:** No runtime behavior changes. `just check-bdd`, `just check-feature-map`, and `just test-unit` results stay identical.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Context-dependent stories accidentally introduce a story-only Provider that drifts from production behavior | Inline `ShiftHomeRoot` wrappers use the real Root, real games fixture, real context. No mocks. |
| `ShiftHudButton` Playground multiplies into too many stories chasing each axis | Hold the line: one Playground story with controls. The control-driven learning is canon for this kind of axis multiplication. |
| The template skeleton story reads as a half-built page rather than a layout shell | Use unmistakably stub content (literally the strings "TopBar slot" / "Middle slot" / "BottomBar slot") so reviewers see it as a layout demo. |
| Stories miss the `[data-shift-home]` host attribute and silently render unstyled | Document the requirement in each story file's top comment; visual breakage would be loud anyway. |
| Hot-reload drag during `ShiftHomeRail` reviews because the full games fixture mounts on every change | Acceptable trade-off for parity with the page; trim only if review feels slow in practice. |

## Documentation / Operational Notes

- No `docs/solutions/` updates required. The control-driven Storybook learning continues to apply unchanged; this plan is a faithful application of it.
- No deployment, migration, or feature-flag concerns. Stories are dev-only — they are not bundled into the portal output.

## Sources & References

- Origin: this turn's user request, following the gap identified after `docs/plans/2026-05-01-003-feat-shift-atomic-theme-plan.md` shipped.
- Prior plan that established the atomic structure: `docs/plans/2026-05-01-003-feat-shift-atomic-theme-plan.md`.
- Brainstorm that drove the structural decomposition: `docs/brainstorms/2026-05-01-shift-theme-atomic-decomposition-requirements.md`.
- Original Shift port plan that included per-level stories (referenced for shape, not executed): `docs/plans/2026-04-29-001-feat-shift-theme-atomic-design-plan.md`.
- Control-driven Storybook coverage: `docs/solutions/best-practices/control-driven-storybook-coverage-for-combinatorial-components-2026-05-01.md`.
- Inset focus ring: `docs/solutions/ui-bugs/inset-outline-clipped-by-overflow-hidden-2026-05-01.md`.
- Decoupled spatial navigation: `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`.
- Canonical control-driven story file: `korri/shared/primitives/components/Tilegrid/Tilegrid.stories.tsx`.
- Existing Shift page story (viewport + meta shape): `korri/shared/themes/shift/pages/ShiftHomePage.stories.tsx`.
