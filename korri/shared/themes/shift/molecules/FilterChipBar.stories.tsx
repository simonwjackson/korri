import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { filterChips } from "../fixtures/nav"
import { FilterChipBar } from "./FilterChipBar"

const meta = {
  title: "Themes/Shift/Molecules/FilterChipBar",
  component: FilterChipBar,
  parameters: { layout: "padded" },
  args: {
    filters: filterChips,
    activeFilter: filterChips[0],
    onFilterChange: () => {},
  },
  decorators: [
    Story => (
      <div className="w-[640px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FilterChipBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const PuzzleSelected: Story = { args: { activeFilter: "Puzzle" } }

function Interactive() {
  const [active, setActive] = useState<string>(filterChips[0] ?? "")
  return (
    <FilterChipBar
      filters={filterChips}
      activeFilter={active}
      onFilterChange={setActive}
    />
  )
}

export const Clickable: Story = { render: () => <Interactive /> }
