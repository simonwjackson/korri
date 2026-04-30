import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { navigationTabs } from "../fixtures/nav"
import { Navigation } from "./Navigation"

const meta = {
  title: "Themes/Shift/Organisms/Navigation",
  component: Navigation,
  parameters: { layout: "fullscreen" },
  args: {
    tabs: navigationTabs,
    activeTab: navigationTabs[0],
    onTabChange: () => {},
  },
} satisfies Meta<typeof Navigation>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

function Interactive() {
  const [active, setActive] = useState<string>(navigationTabs[0] ?? "")
  return (
    <Navigation
      tabs={navigationTabs}
      activeTab={active}
      onTabChange={setActive}
    />
  )
}

export const Clickable: Story = { render: () => <Interactive /> }
