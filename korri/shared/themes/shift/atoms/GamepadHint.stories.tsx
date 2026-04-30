import type { Meta, StoryObj } from "@storybook/react-vite"
import { GamepadHint } from "./GamepadHint"

const meta = {
  title: "Themes/Shift/Atoms/GamepadHint",
  component: GamepadHint,
  parameters: { layout: "centered" },
  args: { glyph: "A", label: "Play" },
} satisfies Meta<typeof GamepadHint>

export default meta
type Story = StoryObj<typeof meta>

export const Play: Story = {}
export const Back: Story = { args: { glyph: "B", label: "Back" } }
export const Categories: Story = { args: { glyph: "Y", label: "Categories" } }
