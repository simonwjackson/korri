import type { Meta, StoryObj } from "@storybook/react-vite"
import { FooterActions } from "./FooterActions"

const meta = {
  title: "Themes/Shift/Organisms/FooterActions",
  component: FooterActions,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof FooterActions>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
