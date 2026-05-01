import type { Meta, StoryObj } from "@storybook/react-vite"
import { TilegridCells } from "./components/TilegridCells"
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

const meta = {
  title: "Design System/Tilegrid",
  parameters: { layout: "fullscreen" },
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
} satisfies Meta

export default meta
type Story = StoryObj

export const Scroll: Story = {
  render: () => (
    <TilegridScrollRoot<Tile> items={tiles} cellSize={120} gap={8}>
      <TilegridCells<Tile> render={t => <TileVisual tile={t} />} />
    </TilegridScrollRoot>
  ),
}

export const ScrollWithHero: Story = {
  render: () => (
    <TilegridScrollRoot<Tile> items={tilesWithHero} cellSize={120} gap={8}>
      <TilegridCells<Tile> render={t => <TileVisual tile={t} />} />
    </TilegridScrollRoot>
  ),
}

export const ScrollEmpty: Story = {
  render: () => (
    <TilegridScrollRoot<Tile> items={[]} cellSize={120} gap={8}>
      <TilegridCells<Tile> render={t => <TileVisual tile={t} />} />
    </TilegridScrollRoot>
  ),
}

/**
 * Six 2x2 heroes interspersed with 30 single-cell tiles. CSS
 * grid-auto-flow:dense packs the singles into the holes around each
 * hero in source order — no JS bin-packer involved in scroll mode.
 */
export const ScrollManyHeroes: Story = {
  render: () => (
    <TilegridScrollRoot<Tile> items={manyHeroes} cellSize={100} gap={8}>
      <TilegridCells<Tile> render={t => <TileVisual tile={t} />} />
    </TilegridScrollRoot>
  ),
}

/**
 * Mixed spans: one 3x3 leader, two 2x2 heroes, the rest single cells.
 * Scroll mode allows arbitrary row depth so span:3 renders unclamped.
 */
export const ScrollMixedSpans: Story = {
  render: () => (
    <TilegridScrollRoot<Tile> items={mixedSpans} cellSize={90} gap={8}>
      <TilegridCells<Tile> render={t => <TileVisual tile={t} />} />
    </TilegridScrollRoot>
  ),
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
  render: () => (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <TilegridPagedRoot<Tile> items={tiles} cellSize={100} gap={8}>
        <TilegridCells<Tile> render={t => <TileVisual tile={t} />} />
        <InlinePagedControls />
      </TilegridPagedRoot>
    </div>
  ),
}

export const PagedWithHero: Story = {
  render: () => (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <TilegridPagedRoot<Tile> items={tilesWithHero} cellSize={100} gap={8}>
        <TilegridCells<Tile> render={t => <TileVisual tile={t} />} />
        <InlinePagedControls />
      </TilegridPagedRoot>
    </div>
  ),
}

export const PagedEmpty: Story = {
  render: () => (
    <TilegridPagedRoot<Tile> items={[]} cellSize={100} gap={8}>
      <TilegridCells<Tile> render={t => <TileVisual tile={t} />} />
    </TilegridPagedRoot>
  ),
}

/**
 * Paged variant of the many-heroes layout. The bin-packer distributes
 * heroes and singles into pages, starting a new page when an item won't
 * fit the remaining cells. Click Prev/Next to step through pages.
 */
export const PagedManyHeroes: Story = {
  render: () => (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <TilegridPagedRoot<Tile> items={manyHeroes} cellSize={90} gap={8}>
        <TilegridCells<Tile> render={t => <TileVisual tile={t} />} />
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
  render: () => (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <TilegridPagedRoot<Tile> items={mixedSpans} cellSize={90} gap={8}>
        <TilegridCells<Tile> render={t => <TileVisual tile={t} />} />
        <InlinePagedControls />
      </TilegridPagedRoot>
    </div>
  ),
}
