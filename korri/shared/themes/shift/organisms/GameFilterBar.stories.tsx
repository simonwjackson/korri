import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { games } from "../fixtures/games"
import { filterChips, type ViewMode } from "../fixtures/nav"
import { GameFilterBar } from "./GameFilterBar"

const meta = {
  title: "Themes/Shift/Organisms/GameFilterBar",
  component: GameFilterBar,
  parameters: { layout: "padded" },
  args: {
    filters: filterChips,
    activeFilter: filterChips[0],
    onFilterChange: () => {},
    viewMode: "grid",
    onViewModeChange: () => {},
    gameCount: games.length,
  },
  decorators: [
    Story => (
      <div className="w-[800px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GameFilterBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const PuzzleSelected: Story = {
  args: { activeFilter: "Puzzle", gameCount: 4 },
}

function Interactive() {
  const [filter, setFilter] = useState<string>(filterChips[0] ?? "All")
  const [view, setView] = useState<ViewMode>("grid")
  return (
    <GameFilterBar
      filters={filterChips}
      activeFilter={filter}
      onFilterChange={setFilter}
      viewMode={view}
      onViewModeChange={setView}
      gameCount={games.length}
    />
  )
}

export const Clickable: Story = { render: () => <Interactive /> }
