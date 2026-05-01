---
title: "feat: Tilegrid rail mode supports rectangular cells and per-item column spans"
type: feat
status: proposed
date: 2026-04-30
origin: docs/brainstorms/2026-04-30-shift-home-screen-visual-language-requirements.md
---

# feat: Tilegrid rail mode supports rectangular cells and per-item column spans

This document is shaped as an **executor prompt** — a self-contained brief
intended to be handed to another LLM session in a fresh checkout of this
repo. The body below is the prompt verbatim. Run it, then return here to
resume the home-screen visual-language brainstorm.

---

# Task: extend Tilegrid to support heterogeneous-width tiles in rail mode

## Why

Korri (a TV/gamepad-first game launcher built with React + Effect RPC, in
this repo) is exploring home-screen visual languages in Storybook. The next
exploration clones the Nintendo Switch 2 home rail: **one wide landscape
"feature" tile (≈16:9) sitting in the same scrolling row as several
vertical 2:3 cover posters, all sharing the same row height**. The rail
scrolls horizontally as one unit; the feature tile and posters scroll
together.

The exploration is required to use the existing `Tilegrid` primitive (this
is a hard product constraint, not a suggestion). Today,
`TilegridRailRoot` forces square uniform cells and disables span. So the
primitive needs a small, principled evolution. Your job is to design and
implement it.

## Read first

Read these files before editing anything. Each is short.

- `AGENTS.md` — repo working agreement. The "Implementation Patterns",
  "Verification", and "Rules of Engagement" sections govern what
  acceptable code looks like (file placement, no barrel exports, fluid
  theme tokens, container-aware sizing, density-over-zoom for grids, no
  inline-style theme escapes, etc.).
- `korri/shared/design-system/components/Tilegrid/Tilegrid.context.tsx` —
  the shared context, `GridItemShape`, `clampSpan`, and the architecture
  comment explaining the compound-component pattern (Roots publish state;
  one cell atom consumes context).
- `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.tsx` —
  the rail Root you'll extend. Today: `gridAutoColumns: cellSize`,
  `gridTemplateRows: cellSize`, `getSpan: () => 1`,
  `maxSpan: { columns: 1, rows: 1 }`. Square, uniform, no spans.
- `korri/shared/design-system/components/Tilegrid/TilegridScrollRoot.tsx`
  and `TilegridPagedRoot.tsx` — sibling Roots; **do not modify** unless
  the change is genuinely shared. Read them so your additions stay
  consistent in shape.
- `korri/shared/design-system/components/Tilegrid/components/TilegridCells.tsx`
  — the cell atom. Reads `getSpan`, `clampSpan`, applies
  `gridColumn: span N / gridRow: span N` style.
- `korri/shared/design-system/lib/useResolvedCSSLength.ts` — the
  resolution helper that lets `cellSize`/`gap` accept either a number
  (zero-cost) or any CSS `<length>` string (sentinel + ResizeObserver).
  Use this same mechanism for any new length fields.
- `korri/shared/design-system/components/Tilegrid/Tilegrid.stories.tsx` —
  Storybook coverage pattern (control-driven combinatorial). Add a new
  story for the new capability; do not delete or rewrite existing ones.
- `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.test.tsx`
  — existing test shape; mirror it for new behavior.
- `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md`
  — the institutional learning that explains *why* there are sibling
  Roots instead of a `mode` prop. Stay inside this pattern.
- `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md`
  — fluid-token rules. Defaults must be tokenizable (numbers OK; if you
  introduce length defaults, prefer references to `var(--spacing)` or
  comparable theme tokens, not hardcoded pixels).

## What you need to add

Two capabilities to **rail mode only** (do not change scroll or paged
behavior):

### 1. Rectangular cells in rail mode

Today `cellSize` is a single value applied to both column width and row
height (square). The rail needs **separate column-width and row-height**
so a 1-cell tile can be a 2:3 portrait poster (e.g., width 155px, height
340px) instead of a square.

Recommended shape (judgment call — pick what fits the existing API best):

- Accept
  `cellSize: number | string | { width: number | string; height: number | string }`
  on `TilegridRailRoot`.
- When `cellSize` is a number or string, behavior is unchanged (square;
  backward-compatible).
- When `cellSize` is `{ width, height }`, `gridAutoColumns` uses width and
  `gridTemplateRows` uses height.
- Both `width` and `height` independently support number or any CSS
  length string, resolved through the existing `useResolvedCSSLength`
  mechanism.

Update `TilegridBaseContext`:

- The current `cellSize: number` field is the resolved square pixel size.
  For rail rectangular mode we need both. Suggested addition: a new
  optional `cellSizeRect: { width: number; height: number }` field on the
  base context, populated by the rail Root only. Other Roots leave it
  undefined; existing context consumers keep working unchanged.
- Alternative: replace `cellSize: number` with
  `cellSize: { width: number; height: number }` everywhere and have square
  Roots set them equal. Cleaner but a wider blast radius — only do this
  if you can update the scroll Root, paged Root, and `TilegridCells`
  consumer in one coherent pass without test churn elsewhere.
- Pick whichever option produces the smaller, more honest diff. Justify
  the choice in a code comment on the context type.

### 2. Per-item horizontal span in rail mode

Today rail mode hardcodes `getSpan: () => 1` and
`maxSpan: { columns: 1, rows: 1 }`. To place a wide feature tile in the
rail, items need to declare a per-item integer column-span:

- In rail mode, use the consumer-supplied `getSpan` (defaulting to
  `item.span ?? 1`), not a hardcoded `() => 1`.
- `maxSpan.columns` should not be 1 in rail mode — items should be free
  to span multiple columns (e.g., a feature tile spanning 4 columns + 3
  gaps in width). `maxSpan.rows` stays 1 (rail is always one row tall).
  - Sensible cap: total items count, or `Number.POSITIVE_INFINITY`. Pick
    whichever is honest with `clampSpan`'s contract; if `Infinity` breaks
    `clampSpan`, use a high number and document why.
- `TilegridCells`'s existing `gridRow: span ${span}` line will then
  incorrectly produce `gridRow: span N` for rail tiles when N > 1,
  expanding rows. In rail mode a tile spans only columns, never rows.
  Either:
  - Have `TilegridCells` read a base-context flag like
    `spanAxis: "both" | "column-only"` published by the Root (rail =
    `"column-only"`, scroll/paged = `"both"`), and emit `gridRow: span 1`
    when column-only.
  - Or have rail Root publish a different `getSpan` that returns 1 for
    rows and N for columns (would require splitting `getSpan` into
    `getColumnSpan` / `getRowSpan`, more API surface).
  - Pick the smaller change. The flag option is preferred unless there's
    a good reason against.

## Acceptance

- `TilegridRailRoot` accepts a rectangular `cellSize` and per-item
  column spans. Existing call sites that pass a number/string `cellSize`
  keep working with no edit. (Verify by running existing tests; none of
  them should need to change to keep passing.)
- A new Storybook story under `Tilegrid.stories.tsx` titled something
  like "Rail / Heterogeneous (Switch-style)" renders a horizontal rail
  with one column-span-4 tile and several column-span-1 tiles in one row,
  all the same height, scrolling together. Use `args`/`controls` for
  `cellSize.width`, `cellSize.height`, `gap`, and the feature tile's
  `span` so the story is exercisable. Do not add a new file for this
  story; extend the existing one.
- A new test in `TilegridRailRoot.test.tsx` covers: (a) rectangular
  cellSize produces a row whose tiles are width × height, not square;
  (b) a tile with `span: 4` occupies 4 column-widths + 3 gap widths and
  one row-height; (c) a numeric `cellSize` still produces a square row
  (backward-compat).
- The `TilegridCells` change does not break existing scroll/paged
  stories or tests. (Existing `Tilegrid.stories.tsx` and gamepad e2e
  remain green.)
- No edits to `korri/products/app/**`. Storybook only.
- No edits to `Tilegrid.gamepad.story.e2e.ts` unless a real bug surfaces;
  the LRUD geometric model handles heterogeneous widths automatically.

## Constraints (from AGENTS.md, the React skill, and the project)

- Two sibling Roots architecture stays intact. Do not introduce a
  `mode: "rail" | "scroll"` prop. Do not collapse Roots. The existing
  comment on `Tilegrid.context.tsx` and
  `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md`
  explain why; respect both.
- No barrel exports. No new `index.ts` re-exports.
- Use product aliases (`@shared/...`) for cross-folder imports.
- Type names follow existing conventions (`TilegridRailRootProps<T>`,
  etc.).
- Length defaults: keep current defaults; if a new default is needed,
  prefer a theme-variable reference over a pixel number. Numeric defaults
  are acceptable when they're hard layout invariants (e.g., gap default
  of 8 today is fine).
- No inline `style={{ ... }}` with raw pixel theme values in tests or
  stories — use the rectangular cellSize API.
- No `console.log`. Use `@shared/logger` if logging is genuinely needed
  (it shouldn't be).
- Strict TypeScript. No `any`. No `as` casts beyond the existing
  context-value cast pattern (which exists because React contexts can't
  carry generics).

## Verification

Run from the repo root:

```bash
just typecheck           # whole-repo TS; passes today, must keep passing
bun x biome check korri/shared/design-system/components/Tilegrid/   # lint
just format              # write
just test-unit -- Tilegrid    # the existing context, scroll, paged, rail, cells tests + your new ones
just dev-storybook       # manual: open Tilegrid → Rail / Heterogeneous (Switch-style) and confirm it looks right
```

The new Storybook story is the load-bearing acceptance demonstration. If
it renders one wide landscape rectangle next to several tall portrait
rectangles in one horizontally scrolling row, all the same height, focus
moving between them via Tab and arrow keys, you're done.

## Out of scope

- Auto-fit / `minCellSize` for the scroll/paged Roots (separate primitive
  evolution; deferred — see
  `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md`
  "Caveats and Open Follow-ups").
- Per-item *row* spans in rail mode (the rail is one row by definition).
- Per-item *aspect override* on individual tiles. We're making cells
  rectangular at the Root level, not per-tile; per-tile aspect would be a
  third capability and is not needed for the Switch home rail.
- Any change to `korri/products/app/**`, `korri/shared/themes/**`, or
  unrelated explorations.

## Deliverable

Modified files only:

- `korri/shared/design-system/components/Tilegrid/Tilegrid.context.tsx`
  (probably — context shape change)
- `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.tsx`
- `korri/shared/design-system/components/Tilegrid/components/TilegridCells.tsx`
  (probably — span-axis flag)
- `korri/shared/design-system/components/Tilegrid/TilegridRailRoot.test.tsx`
  (new test cases)
- `korri/shared/design-system/components/Tilegrid/Tilegrid.context.test.tsx`
  (only if context shape changed)
- `korri/shared/design-system/components/Tilegrid/Tilegrid.stories.tsx`
  (new story)

No new files unless genuinely necessary.

## When done

Reply with:

1. The list of files changed, one line each, with a one-sentence "what
   changed and why".
2. The output of `just typecheck`,
   `just test-unit -- Tilegrid`, and
   `bun x biome check korri/shared/design-system/components/Tilegrid/`
   (last 10 lines of each).
3. A note about which architectural choice you made for the two
   judgment-call points (context shape: extend with `cellSizeRect` vs.
   replace `cellSize`; span-axis: context flag vs. split `getSpan`),
   with the reasoning in one sentence each.
