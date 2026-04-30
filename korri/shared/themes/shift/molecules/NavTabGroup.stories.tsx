import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { navigationTabs } from "../fixtures/nav"
import { NavTabGroup } from "./NavTabGroup"

const meta = {
  title: "Themes/Shift/Molecules/NavTabGroup",
  component: NavTabGroup,
  parameters: { layout: "centered" },
  args: {
    tabs: navigationTabs,
    activeTab: navigationTabs[0],
    onTabChange: () => {},
  },
} satisfies Meta<typeof NavTabGroup>

export default meta
type Story = StoryObj<typeof meta>

function Interactive() {
  const [active, setActive] = useState<string>(navigationTabs[0] ?? "")
  return (
    <NavTabGroup
      tabs={navigationTabs}
      activeTab={active}
      onTabChange={setActive}
    />
  )
}

export const Default: Story = {}
export const SettingsActive: Story = {
  args: { activeTab: navigationTabs[navigationTabs.length - 1] },
}
export const ClickToSwitch: Story = { render: () => <Interactive /> }
