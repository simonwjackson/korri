import type { Meta, StoryObj } from "@storybook/react-vite"
import { TilegridCells } from "./components/TilegridCells"
import type { GridItemShape } from "./Tilegrid.context"
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
    (Story) => (
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
      <TilegridCells<Tile> render={(t) => <TileVisual tile={t} />} />
    </TilegridScrollRoot>
  ),
}

export const ScrollWithHero: Story = {
  render: () => (
    <TilegridScrollRoot<Tile> items={tilesWithHero} cellSize={120} gap={8}>
      <TilegridCells<Tile> render={(t) => <TileVisual tile={t} />} />
    </TilegridScrollRoot>
  ),
}

export const ScrollEmpty: Story = {
  render: () => (
    <TilegridScrollRoot<Tile> items={[]} cellSize={120} gap={8}>
      <TilegridCells<Tile> render={(t) => <TileVisual tile={t} />} />
    </TilegridScrollRoot>
  ),
}
