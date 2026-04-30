import type { Meta, StoryObj } from "@storybook/react-vite"
import { GamepadHintGroup } from "./GamepadHintGroup"

const meta = {
  title: "Themes/Shift/Molecules/GamepadHintGroup",
  component: GamepadHintGroup,
  parameters: { layout: "centered" },
  args: {
    hints: [
      { glyph: "Y", label: "Categories" },
      { glyph: "B", label: "Back" },
      { glyph: "A", label: "Play" },
    ],
  },
} satisfies Meta<typeof GamepadHintGroup>

export default meta
type Story = StoryObj<typeof meta>

export const FooterActions: Story = {}
export const Tight: Story = { args: { gap: "tight" } }
export const SingleHint: Story = {
  args: { hints: [{ glyph: "A", label: "Confirm" }] },
}
