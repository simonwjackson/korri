import type { Meta, StoryObj } from "@storybook/react-vite"
import { motion } from "framer-motion"
import { useState } from "react"
import {
  type TilegridCellProps,
  TilegridCells,
} from "./components/TilegridCells"
import type { GridItemShape } from "./Tilegrid.context"
import { useTilegrid } from "./Tilegrid.context"
import { TilegridPagedRoot } from "./TilegridPagedRoot"
import { TilegridScrollRoot } from "./TilegridScrollRoot"

interface Tile extends GridItemShape {
  id: string
  image: string
  span?: number
}

const tiles: Tile[] = Array.from({ length: 24 }, (_, i) => ({
  id: `tile-${i}`,
  image: `https://picsum.photos/seed/tilegrid-${i}/300/300`,
}))

const tilesWithHero: Tile[] = tiles.map((t, i) =>
  i === 0 ? { ...t, span: 2 } : t,
)

// 36 tiles with multiple span-2 heroes scattered through the sequence.
// Demonstrates how CSS grid-auto-flow:dense (scroll) and the bin-packer
// (paged) fill single-cell tiles around each hero.
const manyHeroes: Tile[] = Array.from({ length: 36 }, (_, i) => ({
  id: `tile-${i}`,
  image: `https://picsum.photos/seed/tilegrid-many-${i}/300/300`,
  span: i % 5 === 0 ? 2 : 1,
}))

// Mixed spans: span:1, span:2, span:3 spread across 28 tiles. The bin-
// packer clamps spans larger than the grid's smaller dimension; in scroll
// mode the row dimension is unbounded so span:3 renders at full size.
const mixedSpans: Tile[] = Array.from({ length: 28 }, (_, i) => {
  const span = i === 0 ? 3 : i === 7 || i === 14 ? 2 : 1
  return {
    id: `tile-${i}`,
    image: `https://picsum.photos/seed/tilegrid-mixed-${i}/300/300`,
    span,
  }
})

function TileVisual({ tile }: { tile: Tile }) {
  return (
    <img
      src={tile.image}
      alt=""
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        borderRadius: 8,
        display: "block",
      }}
    />
  )
}

function renderTileCell({
  cellProps,
  item,
}: {
  cellProps: TilegridCellProps
  item: Tile
}) {
  return (
    <button {...cellProps}>
      <TileVisual tile={item} />
    </button>
  )
}

function renderMotionTileCell({
  cellProps,
  item,
}: {
  cellProps: TilegridCellProps
  item: Tile
}) {
  return (
    <motion.button
      {...cellProps}
      layout
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
    >
      <TileVisual tile={item} />
    </motion.button>
  )
}

function rotateTiles<T>(items: ReadonlyArray<T>): T[] {
  if (items.length <= 1) return [...items]
  const offset = Math.min(5, items.length - 1)
  return [...items.slice(offset), ...items.slice(0, offset)]
}

function StoryControlButton({
  children,
  onClick,
}: {
  children: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: 2,
        border: "1px solid rgba(255,255,255,0.32)",
        borderRadius: 999,
        padding: "6px 12px",
        background: "rgba(10,10,10,0.82)",
        color: "white",
        fontFamily: "system-ui",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  )
}

function startViewTransition(update: () => void) {
  if (typeof document.startViewTransition === "function") {
    document.startViewTransition(update)
    return
  }
  update()
}

function ScrollWithMotionDemo({ cellSize, gap }: StoryArgs) {
  const [items, setItems] = useState<ReadonlyArray<Tile>>(manyHeroes)

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <StoryControlButton
        onClick={() => setItems(current => rotateTiles(current))}
      >
        Shuffle
      </StoryControlButton>
      <TilegridScrollRoot<Tile> items={items} cellSize={cellSize} gap={gap}>
        <TilegridCells<Tile> renderCell={renderMotionTileCell} />
      </TilegridScrollRoot>
    </div>
  )
}

function ScrollWithViewTransitionsDemo({ cellSize, gap }: StoryArgs) {
  const [items, setItems] = useState<ReadonlyArray<Tile>>(manyHeroes)

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <StoryControlButton
        onClick={() =>
          startViewTransition(() => setItems(current => rotateTiles(current)))
        }
      >
        Shuffle
      </StoryControlButton>
      <TilegridScrollRoot<Tile>
        items={items}
        cellSize={cellSize}
        gap={gap}
        getViewTransitionName={item => `tile-${item.id}`}
      >
        <TilegridCells<Tile> renderCell={renderTileCell} />
      </TilegridScrollRoot>
    </div>
  )
}

/**
 * Args shared by every story so the Storybook Controls panel can drive
 * the two layout knobs the Tilegrid Roots expose.
 */
interface StoryArgs {
  cellSize: number
  gap: number
}

const meta = {
  title: "Design System/Tilegrid",
  parameters: { layout: "fullscreen" },
  // Meta-level defaults so the Controls panel always shows initial
  // values, and stories only override when the demo needs different
  // proportions (smaller cells to fit a 3x3 hero, larger cells for the
  // headline scroll demos, etc.).
  args: { cellSize: 100, gap: 8 },
  argTypes: {
    cellSize: {
      control: { type: "range", min: 40, max: 240, step: 10 },
      description: "Side length of one grid cell in pixels (cells are square).",
    },
    gap: {
      control: { type: "range", min: 0, max: 32, step: 2 },
      description: "Px gap between cells.",
    },
  },
  decorators: [
    Story => (
      <div
        style={{
          width: "900px",
          height: "560px",
          padding: 16,
          background: "#0a0a0a",
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Scroll: Story = {
  args: { cellSize: 120 },
  render: ({ cellSize, gap }) => (
    <TilegridScrollRoot<Tile> items={tiles} cellSize={cellSize} gap={gap}>
      <TilegridCells<Tile> renderCell={renderTileCell} />
    </TilegridScrollRoot>
  ),
}

export const ScrollWithHero: Story = {
  args: { cellSize: 120 },
  render: ({ cellSize, gap }) => (
    <TilegridScrollRoot<Tile>
      items={tilesWithHero}
      cellSize={cellSize}
      gap={gap}
    >
      <TilegridCells<Tile> renderCell={renderTileCell} />
    </TilegridScrollRoot>
  ),
}

export const ScrollEmpty: Story = {
  args: { cellSize: 120 },
  render: ({ cellSize, gap }) => (
    <TilegridScrollRoot<Tile> items={[]} cellSize={cellSize} gap={gap}>
      <TilegridCells<Tile> renderCell={renderTileCell} />
    </TilegridScrollRoot>
  ),
}

/**
 * Six 2x2 heroes interspersed with 30 single-cell tiles. CSS
 * grid-auto-flow:dense packs the singles into the holes around each
 * hero in source order — no JS bin-packer involved in scroll mode.
 */
export const ScrollManyHeroes: Story = {
  render: ({ cellSize, gap }) => (
    <TilegridScrollRoot<Tile> items={manyHeroes} cellSize={cellSize} gap={gap}>
      <TilegridCells<Tile> renderCell={renderTileCell} />
    </TilegridScrollRoot>
  ),
}

/**
 * Mixed spans: one 3x3 leader, two 2x2 heroes, the rest single cells.
 * Scroll mode allows arbitrary row depth so span:3 renders unclamped.
 */
export const ScrollMixedSpans: Story = {
  args: { cellSize: 90 },
  render: ({ cellSize, gap }) => (
    <TilegridScrollRoot<Tile> items={mixedSpans} cellSize={cellSize} gap={gap}>
      <TilegridCells<Tile> renderCell={renderTileCell} />
    </TilegridScrollRoot>
  ),
}

/**
 * Uses renderCell to spread Tilegrid's cellProps onto motion.button.
 * The primitive still imports no motion library; this story is just a
 * consumer demonstrating the seam.
 */
export const ScrollWithMotion: Story = {
  render: args => <ScrollWithMotionDemo {...args} />,
}

/**
 * Uses getViewTransitionName to attach stable browser View Transition
 * names to each cell. The story triggers document.startViewTransition
 * itself; Tilegrid only emits the names. Animation is visible in
 * Chromium-based browsers (including Electrobun).
 */
export const ScrollWithViewTransitions: Story = {
  render: args => <ScrollWithViewTransitionsDemo {...args} />,
}

/**
 * Inline page controls. The atoms shipped with the primitive are deferred
 * (see plan); the story authors its own controls against the paged context.
 */
function InlinePagedControls() {
  const { paged } = useTilegrid<Tile>()
  if (!paged) return null
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: 8,
        alignItems: "center",
        color: "white",
        fontFamily: "system-ui",
        fontSize: 12,
      }}
    >
      <button type="button" onClick={paged.prev}>
        ← Prev
      </button>
      <span>
        {paged.currentPage + 1} / {paged.totalPages}
      </span>
      <button type="button" onClick={paged.next}>
        Next →
      </button>
    </div>
  )
}

export const Paged: Story = {
  render: ({ cellSize, gap }) => (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <TilegridPagedRoot<Tile> items={tiles} cellSize={cellSize} gap={gap}>
        <TilegridCells<Tile> renderCell={renderTileCell} />
        <InlinePagedControls />
      </TilegridPagedRoot>
    </div>
  ),
}

export const PagedWithHero: Story = {
  render: ({ cellSize, gap }) => (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <TilegridPagedRoot<Tile>
        items={tilesWithHero}
        cellSize={cellSize}
        gap={gap}
      >
        <TilegridCells<Tile> renderCell={renderTileCell} />
        <InlinePagedControls />
      </TilegridPagedRoot>
    </div>
  ),
}

export const PagedEmpty: Story = {
  render: ({ cellSize, gap }) => (
    <TilegridPagedRoot<Tile> items={[]} cellSize={cellSize} gap={gap}>
      <TilegridCells<Tile> renderCell={renderTileCell} />
    </TilegridPagedRoot>
  ),
}

/**
 * Paged variant of the many-heroes layout. The bin-packer distributes
 * heroes and singles into pages, starting a new page when an item won't
 * fit the remaining cells. Click Prev/Next to step through pages.
 */
export const PagedManyHeroes: Story = {
  args: { cellSize: 90 },
  render: ({ cellSize, gap }) => (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <TilegridPagedRoot<Tile> items={manyHeroes} cellSize={cellSize} gap={gap}>
        <TilegridCells<Tile> renderCell={renderTileCell} />
        <InlinePagedControls />
      </TilegridPagedRoot>
    </div>
  ),
}

/**
 * Paged + mixed spans. Note: in paged mode the bin-packer clamps spans
 * to min(columns, rows). With cellSize:90 and gap:8 over the decorator's
 * 868x528 inner area, the 3x3 leader is clamped to fit whichever
 * dimension is smaller — typically rows, since paged mode bounds row
 * count to what the container can show.
 */
export const PagedMixedSpans: Story = {
  args: { cellSize: 90 },
  render: ({ cellSize, gap }) => (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <TilegridPagedRoot<Tile> items={mixedSpans} cellSize={cellSize} gap={gap}>
        <TilegridCells<Tile> renderCell={renderTileCell} />
        <InlinePagedControls />
      </TilegridPagedRoot>
    </div>
  ),
}
