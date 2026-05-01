import type { Meta, StoryObj } from "@storybook/react-vite"
import { motion, type Variants } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import {
  type TilegridCellProps,
  TilegridCells,
} from "./components/TilegridCells"
import type { GridItemShape } from "./Tilegrid.context"
import { useTilegrid } from "./Tilegrid.context"
import { TilegridPagedRoot } from "./TilegridPagedRoot"
import { TilegridRailRoot } from "./TilegridRailRoot"
import { TilegridScrollRoot } from "./TilegridScrollRoot"

interface Tile extends GridItemShape {
  id: string
  image: string
  span?: number
}

type TilegridStoryMode = "scroll" | "paged" | "rail"
type TilegridDataset = "basic" | "hero" | "empty" | "manyHeroes" | "mixedSpans"
type MotionPreset = "layout" | "stagger" | "hoverTap"

/**
 * Args shared by every story so the Storybook Controls panel can drive
 * the layout, dataset, and animation knobs these demos expose.
 */
interface StoryArgs {
  cellSize: number
  /**
   * Optional CSS-length override for `cellSize` (e.g. `"6rem"`,
   * `"var(--tile-size)"`, `"calc(8vw + 1rem)"`). When non-empty, this takes
   * precedence over the numeric `cellSize` and is forwarded as-is to the
   * Root, exercising the string-input path. Useful for demonstrating live
   * resolution via root font-size, theme variables, or viewport units.
   */
  cellSizeCSS?: string
  gap: number
  /**
   * Optional CSS-length override for `gap`. Same semantics as
   * `cellSizeCSS`.
   */
  gapCSS?: string
  mode: TilegridStoryMode
  dataset: TilegridDataset
  motionPreset: MotionPreset
  /**
   * Outer canvas width forwarded to the story decorator. Empty string =
   * fill the parent (use Storybook's viewport / measure addon to resize).
   * Accepts any CSS length.
   */
  containerWidth: string
  /**
   * Outer canvas height. Empty string = fill the parent. Accepts any CSS
   * length.
   */
  containerHeight: string
  /**
   * Wired to the Storybook Actions panel via `argTypes.onItemClick.action`.
   * Each cell click is logged there, so consumers see real interaction
   * feedback without an in-canvas overlay button.
   */
  onItemClick?: (item: Tile) => void
}

/**
 * Resolve the effective cellSize to forward to the Root: prefer the
 * non-empty CSS-length override; otherwise fall back to the numeric arg.
 */
function effectiveCellSize(args: StoryArgs): number | string {
  return args.cellSizeCSS && args.cellSizeCSS.trim() !== ""
    ? args.cellSizeCSS
    : args.cellSize
}

function effectiveGap(args: StoryArgs): number | string {
  return args.gapCSS && args.gapCSS.trim() !== "" ? args.gapCSS : args.gap
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

function PlaygroundDemo(args: StoryArgs) {
  const { mode, dataset, onItemClick } = args
  const items = datasets[dataset]
  const cellSize = effectiveCellSize(args)
  const gap = effectiveGap(args)

  if (mode === "paged") {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <TilegridPagedRoot<Tile> items={items} cellSize={cellSize} gap={gap}>
          <TilegridCells<Tile>
            renderCell={renderTileCell}
            onItemClick={onItemClick}
          />
          <InlinePagedControls />
        </TilegridPagedRoot>
      </div>
    )
  }

  if (mode === "rail") {
    return (
      <TilegridRailRoot<Tile> items={items} cellSize={cellSize} gap={gap}>
        <TilegridCells<Tile>
          renderCell={renderTileCell}
          onItemClick={onItemClick}
        />
      </TilegridRailRoot>
    )
  }

  return (
    <TilegridScrollRoot<Tile> items={items} cellSize={cellSize} gap={gap}>
      <TilegridCells<Tile>
        renderCell={renderTileCell}
        onItemClick={onItemClick}
      />
    </TilegridScrollRoot>
  )
}

function FramerMotionDemo(args: StoryArgs) {
  const { mode, dataset, motionPreset, onItemClick } = args
  const items = datasets[dataset]
  const cellSize = effectiveCellSize(args)
  const gap = effectiveGap(args)
  const renderCell = renderMotionTileCell(motionPreset)
  const usesSlottedMotionGrid =
    motionPreset === "stagger" || mode === "paged" || mode === "rail"

  // Stagger animation replays whenever the motion.div remounts. Keying it
  // on `dataset` makes "switch dataset in Controls" the trigger that the
  // explicit Shuffle button used to be.
  const staggerKey = motionPreset === "stagger" ? dataset : undefined

  const cells = (
    <TilegridCells<Tile> renderCell={renderCell} onItemClick={onItemClick} />
  )

  if (mode === "rail") {
    return (
      <TilegridRailRoot<Tile>
        items={items}
        cellSize={cellSize}
        gap={gap}
        asChild
      >
        <motion.div
          key={staggerKey}
          layout
          variants={
            motionPreset === "stagger" ? staggerContainerVariants : undefined
          }
          initial={motionPreset === "stagger" ? "hidden" : undefined}
          animate={motionPreset === "stagger" ? "show" : undefined}
          transition={{ type: "spring", stiffness: 360 }}
        >
          {cells}
        </motion.div>
      </TilegridRailRoot>
    )
  }

  if (mode === "paged") {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <TilegridPagedRoot<Tile>
          items={items}
          cellSize={cellSize}
          gap={gap}
          asChild={usesSlottedMotionGrid}
        >
          <motion.div
            key={staggerKey}
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
    <TilegridScrollRoot<Tile>
      items={items}
      cellSize={cellSize}
      gap={gap}
      asChild={usesSlottedMotionGrid}
    >
      {usesSlottedMotionGrid ? (
        <motion.div
          key={staggerKey}
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
  )
}

function ViewTransitionsDemo(args: StoryArgs) {
  const { dataset, onItemClick } = args
  const initialItems = datasets[dataset]
  const cellSize = effectiveCellSize(args)
  const gap = effectiveGap(args)
  const [items, setItems] = useState<ReadonlyArray<Tile>>(initialItems)
  const isFirstRender = useRef(true)

  // The View Transitions API only animates state updates that happen inside
  // `document.startViewTransition`. Switching datasets via Controls becomes
  // the trigger: we wrap the resulting items update so the browser animates
  // matching `view-transition-name` cells across the change.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    startViewTransition(() => setItems(initialItems))
  }, [initialItems])

  return (
    <TilegridScrollRoot<Tile>
      items={items}
      cellSize={cellSize}
      gap={gap}
      getViewTransitionName={item => `tile-${item.id}`}
    >
      <TilegridCells<Tile>
        renderCell={renderTileCell}
        onItemClick={onItemClick}
      />
    </TilegridScrollRoot>
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
    containerWidth: "900px",
    containerHeight: "560px",
  },
  argTypes: {
    cellSize: {
      control: { type: "range", min: 40, max: 240, step: 10 },
      description:
        "Side length of one grid cell in pixels (cells are square). Ignored when cellSizeCSS is set.",
    },
    cellSizeCSS: {
      control: "text",
      description:
        'Optional CSS-length cellSize (e.g. "6rem", "var(--tile-size)", "calc(8vw + 1rem)"). When non-empty, takes precedence over the numeric cellSize and exercises the string-input path with live ResizeObserver-driven resolution.',
    },
    gap: {
      control: { type: "range", min: 0, max: 32, step: 2 },
      description: "Px gap between cells. Ignored when gapCSS is set.",
    },
    gapCSS: {
      control: "text",
      description:
        'Optional CSS-length gap (e.g. "0.5rem"). Same semantics as cellSizeCSS.',
    },
    mode: {
      control: "inline-radio",
      options: ["scroll", "paged", "rail"],
      description:
        "Tilegrid Root to compose: continuous CSS dense grid, paged bin-packed grid, or single-row horizontal rail (Switch / Apple TV style).",
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
    onItemClick: {
      action: "tile clicked",
      description:
        "Cell click handler. Each invocation is logged in the Storybook Actions panel.",
    },
    containerWidth: {
      control: "text",
      description:
        'Outer canvas width. Empty = fill the parent so Storybook\'s viewport / measure addons drive the size. Accepts any CSS length (e.g. "900px", "100%", "60vw").',
    },
    containerHeight: {
      control: "text",
      description:
        "Outer canvas height. Empty = fill the parent. Accepts any CSS length.",
    },
  },
  decorators: [
    (Story, context) => {
      const { containerWidth, containerHeight } = context.args as StoryArgs
      const width =
        containerWidth && containerWidth.trim() !== "" ? containerWidth : "100%"
      const height =
        containerHeight && containerHeight.trim() !== ""
          ? containerHeight
          : "100%"
      return (
        <div
          style={{
            width,
            height,
            padding: 16,
            background: "#0a0a0a",
            boxSizing: "border-box",
          }}
        >
          <Story />
        </div>
      )
    },
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
