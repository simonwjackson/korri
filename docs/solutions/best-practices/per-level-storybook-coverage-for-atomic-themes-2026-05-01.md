---
title: Per-level Storybook coverage when decomposing a theme into atomic design
date: 2026-05-01
category: best-practices
module: korri/shared/themes/shift + storybook
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Decomposing an exploration into atomic-design folders (atoms / molecules / organisms / templates / pages)
  - Porting a theme from one scope attribute or token set to another
  - Writing a plan that produces a multi-level component hierarchy for review
  - Adding Storybook coverage to a theme whose CSS is scoped under a host attribute (e.g., `[data-shift-home]`)
  - Converting a single big story file into per-component stories
related_components:
  - documentation
tags:
  - storybook
  - atomic-design
  - theme-decomposition
  - planning
  - review-surfaces
---

# Per-level Storybook coverage when decomposing a theme into atomic design

## Context

The Shift home surface graduated from a single 872-line story file (`HomeSunlit.stories.tsx`) into a full atomic-design hierarchy under `korri/shared/themes/shift/`: 5 atoms, 9 molecules, 4 organisms, a template Root, and a page. The decomposition plan specified output files for every component but only listed **one** Storybook story — at the page level (`ShiftHomePage.stories.tsx`).

After the plan shipped, a quick "did you do a full decomposition?" question surfaced the gap: the structural decomposition was complete, but per-level review surfaces were missing. Atoms, molecules, organisms, and the template Root had no isolated stories. A follow-up plan (`docs/plans/2026-05-01-004-feat-shift-storybook-coverage-plan.md`) was needed to add 15 more stories across every level.

The miss was a planning omission, not an implementation oversight. The plan's `Output Structure` listed every `.tsx` and explicitly named the page story, so the implementation faithfully produced exactly what was specified. The cost showed up after the fact: a follow-up plan, a separate review cycle, and a second commit series instead of one cohesive decomposition.

The earlier (now-dropped) Shift port plan from `2026-04-29-001-feat-shift-theme-atomic-design-plan.md` had stories at every level. That signal got lost between plans.

## Guidance

When a plan creates an atomic-design hierarchy, treat **per-level Storybook coverage as a first-class planning decision**, not an implementation-time afterthought. The plan must answer four questions explicitly:

### 1. Which components get stories?

Apply a "stories where they earn their keep" rubric instead of one-story-per-file:

| Component shape | Story? | Rationale |
|---|---|---|
| Pure forwarding atom (single-line wrapper around an HTML primitive: `<img>`, `<span>`, Lucide adapter) | **Skip** | A story is a tautology — fully exercised by the molecule that composes it. |
| Atom with non-trivial visual state (focus ring, sized container, container-query behavior) | **Include** | Regression-prone. The story is the canonical visual surface for catching bugs (e.g., the `::after` focus ring on tiles). |
| Every molecule | **Include** | Each is a meaningful visual unit; the cost-to-value of one story per molecule is favorable. |
| Every organism | **Include** | Stories at this level expose composition seams without loading the full page. |
| Template (the layout shell) | **Include** as a skeleton story | Renders the shell with stub `<section>` children labelled by slot ("TopBar slot", "Middle slot", "BottomBar slot") so reviewers see a layout demo, not a half-built page. |
| Page | **Include** | The integration surface; reuses viewport presets that organism / template stories also reference. |

The Shift example: 5 atoms but only 2 atom stories (`ShiftPill`, `ShiftTile`). `ShiftAvatar`, `ShiftHudGlyph`, `ShiftStatusIcon` are pure wrappers and got skipped. Net was 15 stories instead of a literal-one-per-file 17, and the skipped ones were the ones nobody would have visited.

### 2. How are combinatorial axes handled?

Components with independent axes (e.g., `action × glyph × label` on a HUD chip) collapse into a **single control-driven `Playground` story** with `argTypes`, not 9 near-duplicate stories. This is the pre-existing rule from `docs/solutions/best-practices/control-driven-storybook-coverage-for-combinatorial-components-2026-05-01.md`; this guidance just nominates the components in the hierarchy that need it during planning.

### 3. How are context-dependent components rendered in isolation?

Components that consume a Provider (e.g., `useShiftHome()`) need one of:

- **Inline real-Root wrapper** (preferred): wrap the component in the production Provider/Root inside the story's `render` function, backed by the canonical fixture.
- **Mock Provider helper module** (rejected for this codebase): forces every future story author to learn an indirection for ~6 lines of inline code.

The Shift example used inline wrappers exclusively. `ShiftHomeCaption.stories.tsx` and `ShiftHomeRail.stories.tsx` each render their component inside `<ShiftHomeRoot items={games}>{...}</ShiftHomeRoot>`. The Root's mount-time `useEffect` for focus placement early-returns when no `railRef` target exists, so caption-only stories cleanly show the resume-focused state without needing a real rail.

### 4. How do scope-attribute-gated themes render in stories?

When a theme's CSS is scoped under a host attribute (e.g., every Shift token and class hook is under `[data-shift-home]`), every story must wrap the component in a host element with that attribute, or the styles silently no-op:

```tsx
decorators: [
  (Story) => (
    <div data-shift-home style={{ background: "var(--shift-surface)", padding: "2rem" }}>
      <Story />
    </div>
  ),
],
```

For stories that already render a Root (the template story, the rail story), the Root provides the host. Atoms, molecules, and stand-alone organisms need the decorator.

### Story title hierarchy

Story titles mirror the atomic hierarchy so the Storybook sidebar tree visually maps to the file tree:

```
Themes/Shift/Atoms/Pill
Themes/Shift/Atoms/Tile
Themes/Shift/Molecules/HudButton
Themes/Shift/Molecules/HomeCaption
Themes/Shift/Organisms/HomeRail
Themes/Shift/Templates/Home Skeleton
Themes/Shift/Pages/Home
```

A reviewer can scan the sidebar and immediately see what Shift is composed of.

### Plan-time checklist

When planning an atomic-design decomposition, the plan's `Output Structure` should answer all four questions above. Concretely, the plan should list:

- For each atom: include or skip the story, and why
- For each combinatorial component: control-driven `Playground` or single story
- For each context-dependent component: inline-Root wrapper or alternative
- For each scope-attribute-gated theme: the decorator pattern, applied uniformly
- The story-title hierarchy convention

If the plan does not answer these, expect a follow-up plan.

## Why This Matters

Without per-level stories:

1. **Visual regressions in single atoms only surface during page-level review.** The `ShiftTile` `::after` focus ring is regression-prone (see `docs/solutions/ui-bugs/inset-outline-clipped-by-overflow-hidden-2026-05-01.md`). Catching it in isolation requires an atom story; catching it at page level means scrolling, focusing, and verifying inside a much busier surface.
2. **Iteration cost is high.** Tweaking the search-pill expansion timing means loading the full page, navigating to focus, and watching one corner. With a molecule story, the change-and-verify loop is two seconds.
3. **The composition map is invisible to reviewers.** A Shift sidebar tree showing 15 entries across atoms / molecules / organisms / templates / pages communicates the theme's shape at a glance. A single page story communicates only that there is a page.
4. **Follow-up planning cost.** Discovering the gap post-implementation costs a separate plan, separate commits, and separate review cycles. Treating story scope as a first-class planning decision merges the work into the original decomposition.

The cost of writing 15 small stories during the original implementation is materially lower than splitting it into a follow-up: shared context, no plan-writing overhead, no repeat review.

## When to Apply

- Writing an atomic-design decomposition plan.
- Porting a theme from one scope or token set to another.
- Reviewing a plan that produces a multi-level component hierarchy.
- Adding Storybook to a theme whose CSS is scoped under a host attribute.
- Converting a single mega-story file into per-component stories.
- Reviewing brainstorm requirements docs that list output files but not coverage decisions.

## Examples

### Plan-time decision matrix (Shift example)

```
atoms/
  ShiftAvatar         skip      pure <img> wrapper
  ShiftHudGlyph       skip      pure <span> wrapper
  ShiftStatusIcon     skip      pure Lucide adapter
  ShiftPill           include   focus-halo state
  ShiftTile           include   ::after focus ring (regression-prone)
molecules/
  All 8               include   each is a meaningful visual unit
  ShiftHudButton                control-driven Playground (action × glyph × label)
  ShiftHomeCaption              context-dependent → inline ShiftHomeRoot wrapper
organisms/
  All 4               include   composition seams visible in isolation
  ShiftHomeRail                 context-dependent → inline ShiftHomeRoot wrapper
templates/
  ShiftHomeRoot       include   skeleton with TopBar/Middle/BottomBar slot stubs
pages/
  ShiftHomePage       include   integration surface
```

### Inline-Root wrapper for a context-dependent molecule

```tsx
import { games } from "@shared/fixtures/games/games"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect } from "react"
import { useShiftHome } from "../templates/ShiftHome.context"
import { ShiftHomeRoot } from "../templates/ShiftHomeRoot"
import { ShiftHomeCaption } from "./ShiftHomeCaption"

function Focuser({ id }: { readonly id: string }) {
  const { focusTile } = useShiftHome()
  useEffect(() => {
    focusTile(id)
  }, [focusTile, id])
  return null
}

const meta = {
  title: "Themes/Shift/Molecules/HomeCaption",
  component: ShiftHomeCaption,
  parameters: { layout: "fullscreen", backgrounds: { disable: true } },
} satisfies Meta<typeof ShiftHomeCaption>

export default meta
type Story = StoryObj<typeof meta>

export const ResumeFocused: Story = {
  render: () => (
    <ShiftHomeRoot items={games}>
      <div className="flex h-full items-center">
        <ShiftHomeCaption />
      </div>
    </ShiftHomeRoot>
  ),
}

export const NonResumeFocused: Story = {
  render: () => (
    <ShiftHomeRoot items={games}>
      <Focuser id={games[1].id} />
      <div className="flex h-full items-center">
        <ShiftHomeCaption />
      </div>
    </ShiftHomeRoot>
  ),
}
```

The Root is the production Provider, backed by the production fixture. `Focuser` is a tiny sibling component that calls the same `focusTile` API any organism would; it stays in the same file rather than becoming a shared helper. No mock context, no story-helper module.

### Scope-attribute decorator for an atom story

```tsx
const meta = {
  title: "Themes/Shift/Atoms/Tile",
  component: ShiftTile,
  parameters: { layout: "centered", backgrounds: { disable: true } },
  decorators: [
    (Story) => (
      <div
        data-shift-home
        style={{
          background: "var(--shift-surface)",
          padding: "2rem",
          borderRadius: "1rem",
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: { style: { width: 240, height: 240 }, "aria-label": "Shift tile demo" },
  render: (args) => (
    <ShiftTile {...args}>
      <img
        src="https://picsum.photos/seed/shift-tile-story/480/480"
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </ShiftTile>
  ),
} satisfies Meta<typeof ShiftTile>
```

Without the `data-shift-home` host, every `[data-shift-home] .shift-tile` rule in `shift.css` silently no-ops. The decorator is the contract that makes scoped tokens render. Apply it uniformly across every atom, molecule, and stand-alone organism story.

### Template skeleton story

```tsx
const slotStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--shift-ink-dim)",
  fontSize: "1.5rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  border: "1px dashed var(--shift-rule)",
  borderRadius: "var(--shift-radius-tile)",
  margin: "1rem",
}

export const Skeleton: Story = {
  render: () => (
    <ShiftHomeRoot items={games}>
      <section style={{ ...slotStyle, height: "5rem" }}>TopBar slot</section>
      <section style={{ ...slotStyle, flex: 1 }}>Middle slot</section>
      <section style={{ ...slotStyle, height: "5rem" }}>BottomBar slot</section>
    </ShiftHomeRoot>
  ),
}
```

Stub copy ("TopBar slot", "Middle slot", "BottomBar slot") makes the story read as a layout demo, not a half-built page. The dashed rule and uppercase ink-dim labels visually separate this story from any organism story that lives inside the same Root.

### Note on `@storybook/test`

Stories that need to log invocations of optional callbacks (e.g., `onActivate`) can use either `fn()` from `@storybook/test` or the `argTypes.<key>.action` field. If `@storybook/test` is not installed, prefer `argTypes`:

```tsx
argTypes: {
  onActivate: { action: "search activated" },
},
```

This routes the callback through Storybook's actions panel without adding a dependency.

## Related

- `docs/solutions/best-practices/control-driven-storybook-coverage-for-combinatorial-components-2026-05-01.md` — the rule for collapsing axis multiplication into one Playground story (referenced in the Guidance section above).
- `docs/solutions/ui-bugs/inset-outline-clipped-by-overflow-hidden-2026-05-01.md` — the regression class that the `ShiftTile` atom story exists to catch.
- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — Storybook's `preview.tsx` already initializes spatial navigation, so focus-sensitive stories work without per-story setup.
- `docs/plans/2026-05-01-003-feat-shift-atomic-theme-plan.md` — the original decomposition plan that missed the per-level coverage decisions.
- `docs/plans/2026-05-01-004-feat-shift-storybook-coverage-plan.md` — the follow-up plan that filled the gap, and the canonical example of the rubric in action.
- `docs/plans/2026-04-29-001-feat-shift-theme-atomic-design-plan.md` — the dropped earlier port plan that did include per-level stories. Lost signal that this learning recovers.
