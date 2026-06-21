/**
 * Storybook coverage for the ShiftHudChip molecule — the static HUD
 * row used for affordances the home lists but does not handle (e.g.
 * `X Close Software` on Switch). Same visual vocabulary as
 * ShiftHudButton without the input-bus subscription or pulse.
 */

import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftHudChip } from "./ShiftHudChip"

const meta = {
  title: "Themes/Shift/Molecules/HudChip",
  component: ShiftHudChip,
  parameters: {
    layout: "centered",
    backgrounds: { disable: true },
  },
  decorators: [
    Story => (
      <div
        data-shift-home
        style={{
          background: "var(--shift-surface)",
          padding: "2rem",
          borderRadius: "1rem",
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    glyph: "X",
    label: "Close",
  },
  argTypes: {
    glyph: { control: "text" },
    label: { control: "text" },
  },
} satisfies Meta<typeof ShiftHudChip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
