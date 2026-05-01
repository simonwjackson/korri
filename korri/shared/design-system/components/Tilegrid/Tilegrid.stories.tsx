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
