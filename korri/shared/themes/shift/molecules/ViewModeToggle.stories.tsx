import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import type { ViewMode } from "../fixtures/nav"
import { ViewModeToggle } from "./ViewModeToggle"

const meta = {
  title: "Themes/Shift/Molecules/ViewModeToggle",
  component: ViewModeToggle,
  parameters: { layout: "centered" },
  args: { value: "grid", onChange: () => {} },
} satisfies Meta<typeof ViewModeToggle>

export default meta
type Story = StoryObj<typeof meta>

export const GridSelected: Story = { args: { value: "grid" } }
export const ListSelected: Story = { args: { value: "list" } }
export const FeaturedSelected: Story = { args: { value: "featured" } }

function Interactive() {
  const [value, setValue] = useState<ViewMode>("grid")
  return <ViewModeToggle value={value} onChange={setValue} />
}

export const Clickable: Story = { render: () => <Interactive /> }
