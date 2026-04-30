import type { Meta, StoryObj } from "@storybook/react-vite"
import { ScaleProvider } from "../context/ScaleContext"
import { games } from "../fixtures/games"
import { FeaturedGameGrid } from "./FeaturedGameGrid"

const meta = {
  title: "Themes/Shift/Organisms/FeaturedGameGrid",
  component: FeaturedGameGrid,
  parameters: { layout: "fullscreen" },
  args: { games, onGameClick: () => {} },
  decorators: [
    Story => (
      <ScaleProvider>
        <div className="h-[480px] w-[800px] p-4">
          <Story />
        </div>
      </ScaleProvider>
    ),
  ],
} satisfies Meta<typeof FeaturedGameGrid>

export default meta
type Story = StoryObj<typeof meta>

export const FullLibrary: Story = {}
export const FewGames: Story = { args: { games: games.slice(0, 4) } }
export const Empty: Story = { args: { games: [] } }
