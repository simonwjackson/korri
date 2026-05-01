import type { Meta, StoryObj } from "@storybook/react-vite"
import { motion, type Variants } from "framer-motion"
import { useEffect, useState } from "react"
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

type TilegridStoryMode = "scroll" | "paged"
type TilegridDataset = "basic" | "hero" | "empty" | "manyHeroes" | "mixedSpans"
type MotionPreset = "layout" | "stagger" | "hoverTap"

/**
 * Args shared by every story so the Storybook Controls panel can drive
 * the layout, dataset, and animation knobs these demos expose.
 */
interface StoryArgs {
  cellSize: number
  gap: number
  mode: TilegridStoryMode
  dataset: TilegridDataset
  motionPreset: MotionPreset
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

const datasets: Record<TilegridDataset, ReadonlyArray<Tile>> = {
  basic: tiles,
  hero: tilesWithHero,
  empty: [],
  manyHeroes,
  mixedSpans,
}

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

const staggerContainerVariants: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.035,
      delayChildren: 0.04,
    },
  },
}

const staggerTileVariants: Variants = {
  hidden: { opacity: 0, scale: 0.82, y: 18 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 460, damping: 32 },
  },
}

function renderLayoutMotionTileCell({
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

function renderStaggeredMotionTileCell({
  cellProps,
  item,
}: {
  cellProps: TilegridCellProps
  item: Tile
}) {
  return (
    <motion.button {...cellProps} variants={staggerTileVariants}>
      <TileVisual tile={item} />
    </motion.button>
  )
}

function renderHoverTapMotionTileCell({
  cellProps,
  item,
}: {
  cellProps: TilegridCellProps
  item: Tile
}) {
  return (
    <motion.button
      {...cellProps}
      whileHover={{ scale: 1.05, y: -4, zIndex: 1 }}
      whileTap={{ scale: 0.96 }}
      whileFocus={{ scale: 1.04, boxShadow: "0 0 0 3px #facc15" }}
      transition={{ type: "spring", stiffness: 520, damping: 30 }}
      style={{
        ...cellProps.style,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <TileVisual tile={item} />
    </motion.button>
  )
}

function renderMotionTileCell(
  preset: MotionPreset,
): (args: { cellProps: TilegridCellProps; item: Tile }) => React.ReactNode {
  if (preset === "stagger") return renderStaggeredMotionTileCell
  if (preset === "hoverTap") return renderHoverTapMotionTileCell
  return renderLayoutMotionTileCell
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

function PlaygroundDemo({ cellSize, gap, mode, dataset }: StoryArgs) {
  const items = datasets[dataset]

  if (mode === "paged") {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <TilegridPagedRoot<Tile> items={items} cellSize={cellSize} gap={gap}>
          <TilegridCells<Tile> renderCell={renderTileCell} />
          <InlinePagedControls />
        </TilegridPagedRoot>
      </div>
    )
  }

  return (
    <TilegridScrollRoot<Tile> items={items} cellSize={cellSize} gap={gap}>
      <TilegridCells<Tile> renderCell={renderTileCell} />
    </TilegridScrollRoot>
  )
}

function FramerMotionDemo({
  cellSize,
  gap,
  mode,
  dataset,
  motionPreset,
}: StoryArgs) {
  const initialItems = datasets[dataset]
  const [items, setItems] = useState<ReadonlyArray<Tile>>(initialItems)
  const [animationKey, setAnimationKey] = useState(0)

  useEffect(() => {
    setItems(initialItems)
    setAnimationKey(current => current + 1)
  }, [initialItems])

  const renderCell = renderMotionTileCell(motionPreset)
  const usesSlottedMotionGrid = motionPreset === "stagger" || mode === "paged"

  const shuffle = () => {
    setItems(current => rotateTiles(current))
    setAnimationKey(current => current + 1)
  }

  const cells = <TilegridCells<Tile> renderCell={renderCell} />

  if (mode === "paged") {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <StoryControlButton onClick={shuffle}>Shuffle</StoryControlButton>
        <TilegridPagedRoot<Tile>
          items={items}
          cellSize={cellSize}
          gap={gap}
          asChild={usesSlottedMotionGrid}
        >
          <motion.div
            key={motionPreset === "stagger" ? animationKey : undefined}
            layout
            variants={
              motionPreset === "stagger" ? staggerContainerVariants : undefined
            }
            initial={motionPreset === "stagger" ? "hidden" : undefined}
            animate={motionPreset === "stagger" ? "show" : undefined}
            transition={{ type: "spring", stiffness: 360 }}
          >
            {cells}
            <InlinePagedControls />
          </motion.div>
        </TilegridPagedRoot>
      </div>
    )
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <StoryControlButton onClick={shuffle}>Shuffle</StoryControlButton>
      <TilegridScrollRoot<Tile>
        items={items}
        cellSize={cellSize}
        gap={gap}
        asChild={usesSlottedMotionGrid}
      >
        {usesSlottedMotionGrid ? (
          <motion.div
            key={motionPreset === "stagger" ? animationKey : undefined}
            layout={motionPreset === "layout"}
            variants={
              motionPreset === "stagger" ? staggerContainerVariants : undefined
            }
            initial={motionPreset === "stagger" ? "hidden" : undefined}
            animate={motionPreset === "stagger" ? "show" : undefined}
          >
            {cells}
          </motion.div>
        ) : (
          cells
        )}
      </TilegridScrollRoot>
    </div>
  )
}

function ViewTransitionsDemo({ cellSize, gap, dataset }: StoryArgs) {
  const initialItems = datasets[dataset]
  const [items, setItems] = useState<ReadonlyArray<Tile>>(initialItems)

  useEffect(() => {
    setItems(initialItems)
  }, [initialItems])

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

const meta = {
  title: "Design System/Tilegrid",
  parameters: { layout: "fullscreen" },
  // Meta-level defaults so the Controls panel always shows initial values.
  args: {
    cellSize: 100,
    gap: 8,
    mode: "scroll",
    dataset: "basic",
    motionPreset: "layout",
  },
  argTypes: {
    cellSize: {
      control: { type: "range", min: 40, max: 240, step: 10 },
      description: "Side length of one grid cell in pixels (cells are square).",
    },
    gap: {
      control: { type: "range", min: 0, max: 32, step: 2 },
      description: "Px gap between cells.",
    },
    mode: {
      control: "inline-radio",
      options: ["scroll", "paged"],
      description:
        "Tilegrid Root to compose: continuous CSS dense grid or paged bin-packed grid.",
    },
    dataset: {
      control: "select",
      options: ["basic", "hero", "empty", "manyHeroes", "mixedSpans"],
      description: "Fixture shape rendered by the selected Root.",
    },
    motionPreset: {
      control: "inline-radio",
      options: ["layout", "stagger", "hoverTap"],
      description: "Framer Motion behavior for the FramerMotion story.",
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

/**
 * One layout playground for the core Tilegrid contract: choose scroll vs paged
 * Roots, then switch among basic, hero, empty, many-hero, and mixed-span data.
 */
export const Playground: Story = {
  argTypes: {
    motionPreset: { control: false, table: { disable: true } },
  },
  render: args => <PlaygroundDemo {...args} />,
}

/**
 * One Framer Motion playground covering the primitive's animation seams:
 * renderCell for motion.button cells and Root asChild for a motion.div grid.
 */
export const FramerMotion: Story = {
  args: { dataset: "manyHeroes", cellSize: 90 },
  render: args => <FramerMotionDemo {...args} />,
}

/**
 * Browser View Transitions seam. Tilegrid only applies stable names via
 * getViewTransitionName; the consumer owns document.startViewTransition.
 */
export const ViewTransitions: Story = {
  args: { dataset: "manyHeroes" },
  argTypes: {
    mode: { control: false, table: { disable: true } },
    motionPreset: { control: false, table: { disable: true } },
  },
  render: args => <ViewTransitionsDemo {...args} />,
}
