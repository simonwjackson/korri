import type { Meta, StoryObj } from "@storybook/react-vite"
import { ScaleProvider } from "../context/ScaleContext"
import { games } from "../fixtures/games"
import { GameGrid } from "./GameGrid"

const meta = {
  title: "Themes/Shift/Organisms/GameGrid",
  component: GameGrid,
  parameters: { layout: "fullscreen" },
  args: { games, onGameClick: () => {}, viewMode: "grid" },
  decorators: [
    Story => (
      <ScaleProvider>
        <div className="h-[600px] w-[900px] p-4">
          <Story />
        </div>
      </ScaleProvider>
    ),
  ],
} satisfies Meta<typeof GameGrid>

export default meta
type Story = StoryObj<typeof meta>

export const Grid: Story = { args: { viewMode: "grid" } }
export const List: Story = { args: { viewMode: "list" } }
export const Featured: Story = { args: { viewMode: "featured" } }
export const Empty: Story = { args: { games: [] } }
