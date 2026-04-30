import type { Meta, StoryObj } from "@storybook/react-vite"
import { NavTab } from "./NavTab"

const meta = {
  title: "Themes/Shift/Atoms/NavTab",
  component: NavTab,
  parameters: { layout: "centered" },
  args: { label: "Library" },
} satisfies Meta<typeof NavTab>

export default meta
type Story = StoryObj<typeof meta>

export const Inactive: Story = {}
export const Active: Story = { args: { active: true } }
