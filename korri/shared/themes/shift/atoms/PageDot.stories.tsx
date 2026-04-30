import type { Meta, StoryObj } from "@storybook/react-vite"
import { PageDot } from "./PageDot"

const meta = {
  title: "Themes/Shift/Atoms/PageDot",
  component: PageDot,
  parameters: { layout: "centered" },
} satisfies Meta<typeof PageDot>

export default meta
type Story = StoryObj<typeof meta>

export const Inactive: Story = {}
export const Active: Story = { args: { active: true } }
