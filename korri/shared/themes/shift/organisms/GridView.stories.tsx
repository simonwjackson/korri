import type { Meta, StoryObj } from "@storybook/react-vite"
import { games } from "../fixtures/games"
import { type GameRecord, getGameImageUrl } from "../schemas/game"
import { type GridItem, GridView } from "./GridView"

function gameToGridItem(game: GameRecord, index: number): GridItem {
  // Sprinkle a few 2x2 spans to exercise multi-cell layout in stories.
  const span = index === 0 || index === 5 ? 2 : 1
  return {
    id: game.id,
    image:
      getGameImageUrl(game) ?? `https://picsum.photos/seed/${game.id}/200/200`,
    span,
  }
}

const fixtureItems = games.map(gameToGridItem)

const meta = {
  title: "Themes/Shift/Organisms/GridView",
  component: GridView,
  parameters: { layout: "fullscreen" },
  args: {
    items: fixtureItems,
    minItemSize: 80,
    itemScale: 1,
    gap: 12,
    cycle: true,
    transitionType: "slide",
  },
  decorators: [
    Story => (
      <div className="flex h-[520px] w-[900px] items-center justify-center bg-neutral-100 p-6 dark:bg-neutral-900">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GridView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const FadeTransition: Story = { args: { transitionType: "fade" } }
export const NoCycle: Story = { args: { cycle: false } }
export const FlowColumn: Story = { args: { gridFlow: "column" } }
export const Empty: Story = { args: { items: [] } }
export const SingleItem: Story = { args: { items: fixtureItems.slice(0, 1) } }
