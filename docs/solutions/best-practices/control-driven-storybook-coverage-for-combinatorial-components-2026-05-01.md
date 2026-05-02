---
title: Control-driven Storybook coverage for combinatorial component states
date: 2026-05-01
category: best-practices
module: korri/shared/design-system + storybook
problem_type: best_practice
component: testing_framework
severity: medium
applies_when:
  - A component's stories are multiplying across independent axes like mode, dataset, and animation behavior
  - Story IDs are consumed by Playwright component E2E tests
  - Storybook examples need to document composition seams without becoming a long sidebar of near-duplicates
  - Animation examples should remain consumer-owned rather than baked into the primitive
related_components:
  - frontend_stimulus
  - development_workflow
  - tooling
tags:
  - storybook
  - e2e
  - controls
  - tilegrid
  - framer-motion
  - view-transitions
  - react
---

# Control-driven Storybook coverage for combinatorial component states

## Context

Tilegrid started with a useful but growing story matrix:

- scroll vs paged Roots
- basic, hero, empty, many-hero, and mixed-span datasets
- plain cells, Framer Motion layout, staggered entrance, hover/tap/focus motion, and browser View Transitions

That produced many near-duplicate stories. Each new axis threatened to multiply the Storybook sidebar and make Playwright tests brittle because E2E specs targeted individual story IDs like `design-system-tilegrid--scroll` and `design-system-tilegrid--scroll-with-hero`.

The resolved shape consolidated the examples to three stories while preserving coverage:

1. `Playground` — layout behavior with controls for `mode`, `dataset`, `cellSize`, and `gap`
2. `FramerMotion` — consumer-owned Framer examples with controls for `mode`, `dataset`, `motionPreset`, `cellSize`, and `gap`
3. `ViewTransitions` — browser View Transitions seam, kept separate from Framer because it has different runtime requirements

## Guidance

When stories are multiplying by cartesian product, collapse the independent axes into Storybook controls and keep separate stories only for genuinely different concepts.

For Tilegrid, the stable story args became explicit unions:

```ts
type TilegridStoryMode = "scroll" | "paged"
type TilegridDataset = "basic" | "hero" | "empty" | "manyHeroes" | "mixedSpans"
type MotionPreset = "layout" | "stagger" | "hoverTap"

interface StoryArgs {
  cellSize: number
  gap: number
  mode: TilegridStoryMode
  dataset: TilegridDataset
  motionPreset: MotionPreset
}
```

Then a single dataset map turned data-shape variants into a control instead of one story per fixture:

```ts
const datasets: Record<TilegridDataset, ReadonlyArray<Tile>> = {
  basic: tiles,
  hero: tilesWithHero,
  empty: [],
  manyHeroes,
  mixedSpans,
}
```

The main playground branches only at the composition seam being documented: which Root the consumer chooses.

```tsx
function PlaygroundDemo({ cellSize, gap, mode, dataset }: StoryArgs) {
  const items = datasets[dataset]

  if (mode === "paged") {
    return (
      <TilegridPagedRoot items={items} cellSize={cellSize} gap={gap}>
        <TilegridCells renderCell={renderTileCell} />
        <InlinePagedControls />
      </TilegridPagedRoot>
    )
  }

  return (
    <TilegridScrollRoot items={items} cellSize={cellSize} gap={gap}>
      <TilegridCells renderCell={renderTileCell} />
    </TilegridScrollRoot>
  )
}
```

Animation examples stayed in one `FramerMotion` story because the concept is the same across presets: the consumer spreads `cellProps` onto a motion element and optionally uses Root `asChild` for a motion grid container. `ViewTransitions` stayed separate because the browser API seam is not a Framer preset and should demonstrate `getViewTransitionName` clearly.

Hide irrelevant controls at the story level so each story still feels focused:

```ts
export const Playground: Story = {
  argTypes: {
    motionPreset: { control: false, table: { disable: true } },
  },
  render: args => <PlaygroundDemo {...args} />,
}

export const ViewTransitions: Story = {
  argTypes: {
    mode: { control: false, table: { disable: true } },
    motionPreset: { control: false, table: { disable: true } },
  },
  render: args => <ViewTransitionsDemo {...args} />,
}
```

When story IDs change, retarget E2E specs to the surviving controlled story and encode the intended state in the `args` query parameter:

```ts
const PLAYGROUND_STORY_ID = "design-system-tilegrid--playground"

const iframePath = (storyId: string, args?: string) => {
  const query = new URLSearchParams({ id: storyId, viewMode: "story" })
  if (args) query.set("args", args)
  return `/iframe.html?${query.toString()}`
}

await page.goto(iframePath(PLAYGROUND_STORY_ID, "mode:scroll;dataset:hero"))
```

## Why This Matters

- **Stories stay navigable.** Storybook remains a documentation surface instead of a generated matrix of every possible combination.
- **Controls preserve coverage.** A single controlled story can still exercise every data shape and mode that previously required separate exports.
- **E2E tests become more intentional.** Tests name the state they need through Storybook args rather than depending on many permanent story IDs.
- **Conceptual seams remain clear.** Separate stories are reserved for different ideas: core layout playground, Framer Motion consumer seams, and browser View Transitions.
- **Animation remains consumer-owned.** The primitive does not import Framer Motion; the story demonstrates how a consumer can bring that dependency at the edge.

## When to Apply

- Story exports are growing as `mode × dataset × variant × animation` combinations.
- Most stories share the same component tree with only data or enum-like choices changing.
- Playwright tests need stable Storybook targets but should still cover multiple states.
- A design-system primitive needs examples for optional consumer seams without implying those seams are primitive-owned features.

## Examples

### Before: many story exports for matrix cells

```tsx
export const Scroll = { render: renderScrollBasic }
export const ScrollWithHero = { render: renderScrollHero }
export const ScrollEmpty = { render: renderScrollEmpty }
export const ScrollManyHeroes = { render: renderScrollManyHeroes }
export const ScrollMixedSpans = { render: renderScrollMixedSpans }

export const Paged = { render: renderPagedBasic }
export const PagedWithHero = { render: renderPagedHero }
export const PagedEmpty = { render: renderPagedEmpty }
export const PagedManyHeroes = { render: renderPagedManyHeroes }
export const PagedMixedSpans = { render: renderPagedMixedSpans }
```

### After: three durable story concepts

```tsx
export const Playground: Story = {
  render: args => <PlaygroundDemo {...args} />,
}

export const FramerMotion: Story = {
  args: { dataset: "manyHeroes", cellSize: 90 },
  render: args => <FramerMotionDemo {...args} />,
}

export const ViewTransitions: Story = {
  args: { dataset: "manyHeroes" },
  render: args => <ViewTransitionsDemo {...args} />,
}
```

### E2E coverage after consolidation

Retarget story-driven Playwright tests to the three exported stories and use args for state:

- `Playground` with `mode:scroll;dataset:basic` for keyboard focus movement and Enter activation
- `Playground` with `mode:scroll;dataset:hero` for dense/hero spatial navigation
- `Playground` with `mode:paged;dataset:manyHeroes;cellSize:90` for page controls
- `ViewTransitions` with `dataset:manyHeroes` for `view-transition-name` styles
- `Playground` with `mode:scroll;dataset:basic` for gamepad d-pad, confirm, repeat, and stick movement

Prefer not to assert Framer Motion frame-by-frame in E2E. Keep animation behavior covered by typechecking, story rendering, and manual/visual review unless there is a stable observable contract to assert.

## Related

- `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md` — the Tilegrid primitive pattern and animation seams (`renderCell`, Root `asChild`, `getViewTransitionName`).
- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — Storybook-driven Playwright tests for keyboard/gamepad focus behavior.
- `korri/shared/primitives/components/Tilegrid/Tilegrid.stories.tsx` — consolidated Storybook examples.
- `korri/shared/primitives/components/Tilegrid/Tilegrid.story.e2e.ts` — keyboard, paged, and View Transition story E2E coverage.
- `korri/shared/primitives/components/Tilegrid/Tilegrid.gamepad.story.e2e.ts` — gamepad story E2E coverage.
